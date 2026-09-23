import { z } from "zod";

// Extension pages run under a CSP without eval; keep zod off its JIT path.
z.config({ jitless: true });

export const LIMITS = {
  textBytes: 64 * 1024,
  fieldsPerDraft: 100,
  revisionBytes: 256 * 1024,
  revisionsPerDraft: 3,
  totalDrafts: 200,
  totalBytes: 20 * 1024 * 1024,
  messageBytes: 320 * 1024,
  fieldRules: 1000,
  sites: 1000,
  metaString: 200,
  optionsSignature: 2000,
  selectValues: 100,
} as const;

export const RETENTION_DAYS = [1, 7, 30] as const;
export const DEFAULT_RETENTION_DAYS = 7;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const SCHEMA_VERSION = 1;

const meta = z.string().max(LIMITS.metaString);
const id = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);
const url = z.string().max(4096);

export const fieldValueSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text"), text: z.string().max(LIMITS.textBytes) }),
  z.strictObject({ kind: z.literal("select"), values: z.array(z.string().max(LIMITS.metaString * 5)).max(LIMITS.selectValues) }),
  z.strictObject({ kind: z.literal("checkbox"), checked: z.boolean() }),
  z.strictObject({ kind: z.literal("radio"), selectedOptionKey: z.string().max(LIMITS.metaString * 5).nullable() }),
]);
export type FieldValue = z.infer<typeof fieldValueSchema>;

/** Transient field metadata from the page; hashed in the background, never persisted raw. */
export const fieldDescriptorSchema = z.strictObject({
  kind: z.enum(["text", "select", "checkbox", "radio"]),
  id: meta,
  name: meta,
  label: meta,
  group: meta,
  /** Ordered option values for selects/radio groups; checkbox value. */
  options: z.string().max(LIMITS.optionsSignature),
  ordinal: z.number().int().min(0).max(10_000),
  /** Index among controls in the same container sharing tag/type/id/name; 0 when unique. */
  occurrence: z.number().int().min(0).max(10_000),
});
export type FieldDescriptor = z.infer<typeof fieldDescriptorSchema>;

export const formDescriptorSchema = z.strictObject({
  virtual: z.boolean(),
  id: meta,
  name: meta,
  /** Same-origin action path, or "" when absent/cross-origin. */
  action: meta,
  /** Ordered supported-control signature captured at first edit. */
  signature: z.string().max(LIMITS.optionsSignature),
  ordinal: z.number().int().min(0).max(10_000),
});
export type FormDescriptor = z.infer<typeof formDescriptorSchema>;

export const epochSchema = z.strictObject({ global: z.number().int().min(0), site: z.number().int().min(0) });
export type Epoch = z.infer<typeof epochSchema>;

export const fieldDeltaSchema = z.strictObject({
  descriptor: fieldDescriptorSchema,
  /** null = purge this field (became sensitive or screened). */
  value: fieldValueSchema.nullable(),
  editedAt: z.number().int().min(0),
});
export type FieldDelta = z.infer<typeof fieldDeltaSchema>;

// ---- content script → background ----
export const contentMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("handshake"), documentSessionId: id, url }),
  z.strictObject({
    type: z.literal("commit"),
    capability: id,
    requestId: id,
    sequence: z.number().int().min(1),
    epoch: epochSchema,
    url,
    form: formDescriptorSchema,
    fields: z.array(fieldDeltaSchema).min(1).max(LIMITS.fieldsPerDraft),
  }),
  z.strictObject({ type: z.literal("searchIncluded"), capability: id, url, form: formDescriptorSchema, descriptor: fieldDescriptorSchema }),
  z.strictObject({ type: z.literal("submitted"), capability: id, url, form: formDescriptorSchema }),
]);
export type ContentMessage = z.infer<typeof contentMessageSchema>;

// ---- background → content script ----
export const pageFieldSchema = z.strictObject({
  ref: z.number().int().min(0),
  descriptor: fieldDescriptorSchema,
  form: formDescriptorSchema,
  search: z.boolean(),
  current: fieldValueSchema,
  fingerprint: z.string().max(64),
  /** Present-page label, shown transiently in trusted UI only. */
  displayLabel: meta,
});
export type PageField = z.infer<typeof pageFieldSchema>;

export const applyItemSchema = z.strictObject({ ref: z.number().int().min(0), value: fieldValueSchema, expectedFingerprint: z.string().max(64) });
export type ApplyItem = z.infer<typeof applyItemSchema>;

export const applyOutcomeSchema = z.enum(["restored", "skipped", "conflict", "unsupported", "failed"]);
export type ApplyOutcome = z.infer<typeof applyOutcomeSchema>;

export const toContentMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("invalidate") }),
  z.strictObject({ type: z.literal("stop") }),
  z.strictObject({ type: z.literal("status") }),
  z.strictObject({ type: z.literal("describe"), capability: id }),
  z.strictObject({ type: z.literal("apply"), capability: id, restoreId: id, items: z.array(applyItemSchema).max(LIMITS.fieldsPerDraft) }),
  z.strictObject({ type: z.literal("undo"), capability: id, restoreId: id }),
]);
export type ToContentMessage = z.infer<typeof toContentMessageSchema>;

export type SaveState = "ready" | "saving" | "saved" | "paused" | "error" | "idle";
export type SaveErrorCode = "quota" | "too-large" | "revoked" | "stale" | "storage" | "rejected";

// ---- extension UI → background ----
export const uiMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("popupState"), tabId: z.number().int().min(0) }),
  z.strictObject({ type: z.literal("enableSite"), tabId: z.number().int().min(0) }),
  z.strictObject({ type: z.literal("disableSite"), origin: url, keepDrafts: z.boolean() }),
  z.strictObject({ type: z.literal("setPaused"), paused: z.boolean() }),
  z.strictObject({ type: z.literal("getSettings") }),
  z.strictObject({ type: z.literal("setRetention"), days: z.union([z.literal(1), z.literal(7), z.literal(30)]) }),
  z.strictObject({ type: z.literal("listDrafts") }),
  z.strictObject({ type: z.literal("getDraft"), draftId: id }),
  z.strictObject({ type: z.literal("deleteDraft"), draftId: id }),
  z.strictObject({ type: z.literal("deleteSite"), origin: url }),
  z.strictObject({ type: z.literal("deleteAll") }),
  z.strictObject({ type: z.literal("recoveryCandidates"), tabId: z.number().int().min(0) }),
  z.strictObject({ type: z.literal("planRestore"), tabId: z.number().int().min(0), draftId: id }),
  z.strictObject({
    type: z.literal("restore"),
    planId: id,
    selections: z.array(z.strictObject({ fieldKey: z.string().max(64), replace: z.boolean() })).max(LIMITS.fieldsPerDraft),
  }),
  z.strictObject({ type: z.literal("undoRestore"), planId: id }),
  z.strictObject({ type: z.literal("pageFields"), tabId: z.number().int().min(0) }),
  z.strictObject({ type: z.literal("setFieldRule"), planId: id, ref: z.number().int().min(0), mode: z.enum(["exclude", "include-search"]) }),
  z.strictObject({ type: z.literal("diagnostics") }),
]);
export type UiMessage = z.infer<typeof uiMessageSchema>;

/** Serialized UTF-8 size, used for message and storage budgets. */
export function byteSize(value: unknown): number {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).length;
}

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Parse an incoming message: size is checked before schema parsing so
 * oversized payloads are rejected before any expensive work.
 */
export function parseMessage<T>(schema: z.ZodType<T>, raw: unknown): { ok: true; data: T } | { ok: false; error: string } {
  let size: number;
  try {
    size = byteSize(raw);
  } catch {
    return { ok: false, error: "unserializable" };
  }
  if (size > LIMITS.messageBytes) return { ok: false, error: "too-large" };
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: "invalid" };
}
