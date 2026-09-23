import { normalizeTokens } from "../classification/index.js";
import type { FieldDescriptor, FormDescriptor } from "../schemas/index.js";
import type { StoredField } from "../schemas/stored.js";

/** Keyed hash (HMAC-SHA-256 in the extension). Output is an opaque string. */
export type Hasher = (input: string) => Promise<string>;

export type Identity = StoredField["identity"];

function tok(text: string): string {
  return normalizeTokens(text).join("");
}

/**
 * Route identity covers path, query and fragment so different document or
 * account contexts are never silently merged. Origin is stored separately.
 */
export async function routeHash(hash: Hasher, href: string): Promise<string> {
  const u = new URL(href);
  return hash(`route|${u.pathname}${u.search}${u.hash}`);
}

export async function formKey(hash: Hasher, form: FormDescriptor): Promise<string> {
  return hash(["form", form.virtual ? "v" : "f", tok(form.id), tok(form.name), form.action, form.signature, form.virtual ? form.ordinal : ""].join("|"));
}

const GENERIC: Record<StoredField["kind"], string> = {
  text: "Text field",
  select: "Choice list",
  checkbox: "Checkbox",
  radio: "Option group",
};

export function genericLabel(kind: StoredField["kind"], ordinal: number): string {
  return `${GENERIC[kind]} ${ordinal + 1}`;
}

/**
 * id/name/label use the same "tok" domain so equality between them can be
 * detected after hashing (an id and name carrying the same token count as
 * one matching signal).
 */
export async function fieldIdentity(hash: Hasher, fKey: string, d: FieldDescriptor): Promise<{ fieldKey: string; identity: Identity }> {
  const [idT, nameT, labelT] = [tok(d.id), tok(d.name), tok(d.label)];
  const identity: Identity = {
    groupHash: await hash(`group|${fKey}|${tok(d.group)}`),
    ordinal: d.ordinal,
  };
  if (idT) identity.stableIdHash = await hash(`tok|${idT}`);
  if (nameT) identity.nameHash = await hash(`tok|${nameT}`);
  if (labelT) identity.labelHash = await hash(`tok|${labelT}`);
  if (d.kind !== "text") identity.optionsHash = await hash(`opts|${d.options}`);
  const anchor = idT || nameT ? "" : `${labelT}#${d.ordinal}`;
  const fieldKey = await hash(`field|${d.kind}|${fKey}|${idT}|${nameT}|${anchor}|${d.occurrence}|${d.kind === "text" ? "" : d.options}`);
  return { fieldKey, identity };
}
