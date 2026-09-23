import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { matchFields, scorePair, type CurrentField, type SavedField } from "@form-rescue/core";

const FORM = "form-a";
const id = (o: Partial<SavedField["identity"]> = {}) => ({ groupHash: "g", ordinal: 0, ...o });
const saved = (fieldKey: string, identity: SavedField["identity"], kind: SavedField["kind"] = "text"): SavedField => ({ fieldKey, kind, identity });
const current = (ref: number, identity: SavedField["identity"], kind: SavedField["kind"] = "text", formKey = FORM): CurrentField => ({ ref, kind, identity, formKey });

describe("matchFields", () => {
  it("direct match on unique name + distinct label + group", () => {
    const s = [saved("a", id({ nameHash: "n1", labelHash: "l1" }))];
    const c = [current(0, id({ nameHash: "n1", labelHash: "l1" })), current(1, id({ nameHash: "n2", labelHash: "l2", ordinal: 1 }))];
    expect(matchFields(s, c, FORM)).toEqual([{ fieldKey: "a", status: "direct", ref: 0, score: 100 }]);
  });

  it("id and name with the same token count once; echoing label adds nothing", () => {
    const i = id({ stableIdHash: "t", nameHash: "t", labelHash: "t" });
    const r = scorePair(i, i, { id: () => true, name: () => true, label: () => true });
    expect(r).toEqual({ score: 60 + 20 + 5, signals: 2 });
  });

  it("name-only textarea with echoing label is too weak → manual", () => {
    const i = id({ nameHash: "msg", labelHash: "msg" });
    expect(matchFields([saved("a", i)], [current(0, i)], FORM)[0]).toMatchObject({ status: "manual", reason: "weak-identity" });
  });

  it("duplicate names are not unique evidence", () => {
    const s = [saved("a", id({ nameHash: "dup" }))];
    const c = [current(0, id({ nameHash: "dup" })), current(1, id({ nameHash: "dup", ordinal: 1 }))];
    expect(matchFields(s, c, FORM)[0]).toMatchObject({ status: "manual" });
  });

  it("repeated labels do not count", () => {
    const s = [saved("a", id({ labelHash: "L", nameHash: "x" })), saved("b", id({ labelHash: "L", nameHash: "y", ordinal: 1 }))];
    const c = [current(0, id({ labelHash: "L", nameHash: "x" })), current(1, id({ labelHash: "L", nameHash: "y", ordinal: 1 }))];
    const r = matchFields(s, c, FORM);
    expect(r.every((m) => m.status === "manual")).toBe(true);
  });

  it("changed form order still matches by stable identity, ordinal is only weak", () => {
    const s = [saved("a", id({ stableIdHash: "i1", nameHash: "n1", ordinal: 0 })), saved("b", id({ stableIdHash: "i2", nameHash: "n2", ordinal: 1 }))];
    const c = [current(0, id({ stableIdHash: "i2", nameHash: "n2", ordinal: 0 })), current(1, id({ stableIdHash: "i1", nameHash: "n1", ordinal: 1 }))];
    const r = matchFields(s, c, FORM);
    expect(r).toEqual([
      { fieldKey: "a", status: "direct", ref: 1, score: 130 },
      { fieldKey: "b", status: "direct", ref: 0, score: 130 },
    ]);
  });

  it("inserted fields do not shift matches", () => {
    const s = [saved("a", id({ stableIdHash: "i1", nameHash: "n1" }))];
    const c = [current(0, id({ nameHash: "new" })), current(1, id({ stableIdHash: "i1", nameHash: "n1", ordinal: 1 }))];
    expect(matchFields(s, c, FORM)[0]).toMatchObject({ status: "direct", ref: 1 });
  });

  it("changed option set for select → manual", () => {
    const s = [saved("a", id({ nameHash: "n", labelHash: "l", optionsHash: "o1" }), "select")];
    const c = [current(0, id({ nameHash: "n", labelHash: "l", optionsHash: "o2" }), "select")];
    expect(matchFields(s, c, FORM)[0]).toMatchObject({ status: "manual", reason: "kind-or-options-changed" });
  });

  it("different kind → manual", () => {
    const s = [saved("a", id({ nameHash: "n", labelHash: "l" }), "text")];
    const c = [current(0, id({ nameHash: "n", labelHash: "l" }), "checkbox")];
    expect(matchFields(s, c, FORM)[0]).toMatchObject({ status: "manual" });
  });

  it("different form key (redesign / lookalike form) → manual", () => {
    const i = id({ stableIdHash: "i", nameHash: "n", labelHash: "l" });
    expect(matchFields([saved("a", i)], [current(0, i, "text", "other-form")], FORM)[0]).toMatchObject({ status: "manual", reason: "form-changed" });
  });

  it("no current fields → manual", () => {
    expect(matchFields([saved("a", id({ nameHash: "n" }))], [], FORM)[0]).toMatchObject({ status: "manual", reason: "form-changed" });
  });

  it("no evidence at all → no-match", () => {
    const s = [saved("a", id({ nameHash: "n", groupHash: "g1" }))];
    const c = [current(0, id({ nameHash: "m", groupHash: "g2", ordinal: 3 }))];
    expect(matchFields(s, c, FORM)[0]).toMatchObject({ status: "manual", reason: "no-match" });
  });

  it("insufficient margin → ambiguous", () => {
    // Best: name(50)+group(20)+ordinal(5)+label(25)=100; second: id(60)+group(20)=80 → margin 20 < 25.
    const s = [saved("a", id({ nameHash: "n", labelHash: "l", stableIdHash: "i" }))];
    const c = [
      current(0, id({ nameHash: "n", labelHash: "l" })),
      current(1, id({ stableIdHash: "i", ordinal: 1 })),
    ];
    expect(matchFields(s, c, FORM)[0]).toMatchObject({ status: "manual", reason: "ambiguous" });
  });

  it("two saved fields can never claim one target", () => {
    const s = [
      saved("a", id({ stableIdHash: "i1", labelHash: "l" })),
      saved("b", id({ stableIdHash: "i2", labelHash: "l2", ordinal: 1 })),
    ];
    const c = [current(0, id({ stableIdHash: "i1", labelHash: "l2" })), current(1, id({ stableIdHash: "i2", ordinal: 5, groupHash: "zz" }))];
    const r = matchFields(s, c, FORM);
    const directRefs = r.flatMap((m) => (m.status === "direct" ? [m.ref] : []));
    expect(new Set(directRefs).size).toBe(directRefs.length);
  });

  it("property: direct matches are always one-to-one, above threshold and within the draft's form", () => {
    const h = fc.constantFrom("a", "b", "c", undefined);
    const ident = fc.record({
      stableIdHash: h, nameHash: h, labelHash: h, groupHash: fc.constantFrom("g", "h"), optionsHash: fc.constantFrom("o", undefined), ordinal: fc.nat(3),
    });
    const kind = fc.constantFrom("text", "select", "checkbox", "radio") as fc.Arbitrary<SavedField["kind"]>;
    fc.assert(
      fc.property(
        fc.array(fc.record({ identity: ident, kind }), { maxLength: 6 }),
        fc.array(fc.record({ identity: ident, kind, formKey: fc.constantFrom(FORM, "x") }), { maxLength: 6 }),
        (ss, cs) => {
          const s = ss.map((x, i) => saved(`k${i}`, x.identity, x.kind));
          const c = cs.map((x, i) => current(i, x.identity, x.kind, x.formKey));
          const r = matchFields(s, c, FORM);
          const refs = r.flatMap((m) => (m.status === "direct" ? [m.ref] : []));
          expect(new Set(refs).size).toBe(refs.length);
          for (const m of r) {
            if (m.status !== "direct") continue;
            expect(m.score).toBeGreaterThanOrEqual(80);
            const target = c[m.ref]!;
            const src = s.find((x) => x.fieldKey === m.fieldKey)!;
            expect(target.formKey).toBe(FORM);
            expect(target.kind).toBe(src.kind);
          }
        },
      ),
    );
  });
});
