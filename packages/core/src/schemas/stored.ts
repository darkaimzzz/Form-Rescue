import { z } from "zod";
import { fieldValueSchema, LIMITS, SCHEMA_VERSION } from "./index.js";

/** Persisted records are untrusted on read: every read path validates with these. */

const hash = z.string().max(64);
const ts = z.number().int().min(0).max(8.64e15);

export const storedFieldSchema = z.strictObject({
  fieldKey: hash,
  kind: z.enum(["text", "select", "checkbox", "radio"]),
  identity: z.strictObject({
    stableIdHash: hash.optional(),
    nameHash: hash.optional(),
    labelHash: hash.optional(),
    groupHash: hash,
    optionsHash: hash.optional(),
    ordinal: z.number().int().min(0).max(10_000),
  }),
  genericLabel: z.string().max(64),
  value: fieldValueSchema,
  editedAt: ts,
});
export type StoredField = z.infer<typeof storedFieldSchema>;

export const draftSchema = z.strictObject({
  id: z.string().max(64),
  origin: z.string().max(512),
  routeHash: hash,
  formKey: hash,
  documentSessionId: z.string().max(64),
  createdAt: ts,
  updatedAt: ts,
  expiresAt: ts,
  latestRevisionId: z.string().max(64),
  lastSequence: z.number().int().min(0),
  status: z.enum(["active", "submission-attempted"]),
  byteSize: z.number().int().min(0),
  schemaVersion: z.literal(SCHEMA_VERSION),
});
export type Draft = z.infer<typeof draftSchema>;

export const revisionSchema = z.strictObject({
  id: z.string().max(64),
  draftId: z.string().max(64),
  sequence: z.number().int().min(1),
  fields: z.array(storedFieldSchema).max(LIMITS.fieldsPerDraft),
  committedAt: ts,
  byteSize: z.number().int().min(0).max(LIMITS.revisionBytes),
});
export type Revision = z.infer<typeof revisionSchema>;

export const sitePolicySchema = z.strictObject({
  origin: z.string().max(512),
  enabled: z.boolean(),
  epoch: z.number().int().min(0),
  /** Set just before an intentional "disable and keep drafts" permission removal. */
  keepDraftsOnRemoval: z.boolean(),
  updatedAt: ts,
});
export type SitePolicy = z.infer<typeof sitePolicySchema>;

export const fieldRuleSchema = z.strictObject({
  id: z.string().max(200),
  origin: z.string().max(512),
  fieldKey: hash,
  mode: z.enum(["exclude", "include-search"]),
  createdAt: ts,
});
export type FieldRule = z.infer<typeof fieldRuleSchema>;

export const metadataSchema = z.strictObject({
  key: z.literal("meta"),
  globalEpoch: z.number().int().min(0),
  totalBytes: z.number().int().min(0),
  retentionDays: z.union([z.literal(1), z.literal(7), z.literal(30)]),
  paused: z.boolean(),
});
export type Metadata = z.infer<typeof metadataSchema>;
