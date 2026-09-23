import type { Identity } from "../identity/index.js";
import type { StoredField } from "../schemas/stored.js";

/**
 * Deterministic, conservative field matching (PRD §8.2). Anything short of a
 * clear, unique, one-to-one match becomes manual copy — never a guess.
 */

export const SCORE = { id: 60, name: 50, label: 25, group: 20, ordinal: 5 } as const;
export const MIN_SCORE = 80;
export const MIN_SIGNALS = 2;
export const MIN_MARGIN = 25;

export interface SavedField {
  fieldKey: string;
  kind: StoredField["kind"];
  identity: Identity;
}

export interface CurrentField {
  ref: number;
  kind: StoredField["kind"];
  identity: Identity;
  formKey: string;
}

export type ManualReason = "no-match" | "weak-identity" | "ambiguous" | "duplicate-target" | "kind-or-options-changed" | "form-changed";

export type FieldMatch =
  { fieldKey: string; status: "direct"; ref: number; score: number } | { fieldKey: string; status: "manual"; reason: ManualReason; ref?: number };

function counts(values: (string | undefined)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

export function scorePair(
  s: Identity,
  c: Identity,
  unique: { id: (h: string) => boolean; name: (h: string) => boolean; label: (h: string) => boolean },
): { score: number; signals: number } {
  let score = 0;
  let signals = 0;
  const counted = new Set<string>();
  if (s.stableIdHash && s.stableIdHash === c.stableIdHash && unique.id(s.stableIdHash)) {
    score += SCORE.id;
    signals++;
    counted.add(s.stableIdHash);
  }
  if (s.nameHash && s.nameHash === c.nameHash && unique.name(s.nameHash) && !counted.has(s.nameHash)) {
    score += SCORE.name;
    signals++;
    counted.add(s.nameHash);
  }
  // A label that merely echoes an id/name token adds no independent evidence.
  if (s.labelHash && s.labelHash === c.labelHash && unique.label(s.labelHash) && !counted.has(s.labelHash)) {
    score += SCORE.label;
    signals++;
  }
  if (s.groupHash === c.groupHash) {
    score += SCORE.group;
    signals++;
  }
  // Ordinal is weak evidence: it adds points but never counts as an independent signal.
  if (s.ordinal === c.ordinal) score += SCORE.ordinal;
  return { score, signals };
}

export function matchFields(saved: SavedField[], current: CurrentField[], draftFormKey: string): FieldMatch[] {
  const sameForm = current.filter((c) => c.formKey === draftFormKey);
  const cur = {
    id: counts(sameForm.map((c) => c.identity.stableIdHash)),
    name: counts(sameForm.map((c) => c.identity.nameHash)),
    label: counts(sameForm.map((c) => c.identity.labelHash)),
  };
  const sav = {
    id: counts(saved.map((s) => s.identity.stableIdHash)),
    name: counts(saved.map((s) => s.identity.nameHash)),
    label: counts(saved.map((s) => s.identity.labelHash)),
  };
  const unique = {
    id: (h: string) => cur.id.get(h) === 1 && sav.id.get(h) === 1,
    name: (h: string) => cur.name.get(h) === 1 && sav.name.get(h) === 1,
    label: (h: string) => cur.label.get(h) === 1 && sav.label.get(h) === 1,
  };

  const provisional = saved.map((s): FieldMatch => {
    if (sameForm.length === 0) return { fieldKey: s.fieldKey, status: "manual", reason: "form-changed" };
    const scored = sameForm
      .map((c) => {
        const compatible = c.kind === s.kind && (s.kind === "text" || c.identity.optionsHash === s.identity.optionsHash);
        return { c, compatible, ...scorePair(s.identity, c.identity, unique) };
      })
      .sort((a, b) => b.score - a.score);
    const best = scored[0]!;
    const second = scored[1]?.score ?? 0;
    if (!best.compatible) {
      return best.score >= MIN_SCORE
        ? { fieldKey: s.fieldKey, status: "manual", reason: "kind-or-options-changed" }
        : { fieldKey: s.fieldKey, status: "manual", reason: "no-match" };
    }
    if (best.score < MIN_SCORE || best.signals < MIN_SIGNALS) {
      return { fieldKey: s.fieldKey, status: "manual", reason: best.score > 0 ? "weak-identity" : "no-match" };
    }
    if (best.score - second < MIN_MARGIN) return { fieldKey: s.fieldKey, status: "manual", reason: "ambiguous" };
    return { fieldKey: s.fieldKey, status: "direct", ref: best.c.ref, score: best.score };
  });

  // One-to-one: two saved fields may never target one current field.
  const targets = counts(provisional.map((m) => (m.status === "direct" ? String(m.ref) : undefined)));
  return provisional.map((m) =>
    m.status === "direct" && targets.get(String(m.ref))! > 1 ? { fieldKey: m.fieldKey, status: "manual", reason: "duplicate-target" } : m,
  );
}
