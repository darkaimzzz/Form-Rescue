import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from "idb";
import {
  byteSize,
  DEFAULT_RETENTION_DAYS,
  draftSchema,
  evictionOrder,
  expiryFor,
  fieldRuleSchema,
  isExpired,
  LIMITS,
  metadataSchema,
  revisionSchema,
  SCHEMA_VERSION,
  sitePolicySchema,
  type Draft,
  type Epoch,
  type FieldRule,
  type Metadata,
  type Revision,
  type SitePolicy,
  type StoredField,
} from "@form-rescue/core";

export const DB_NAME = "form-rescue";
export const DB_VERSION = 1;

interface Schema extends DBSchema {
  drafts: {
    key: string;
    value: Draft;
    indexes: {
      origin: string;
      route: [string, string, string];
      session: [string, string, string, string];
      updatedAt: number;
      expiresAt: number;
    };
  };
  revisions: { key: string; value: Revision; indexes: { draftId: string } };
  sitePolicies: { key: string; value: SitePolicy };
  fieldExclusions: { key: string; value: FieldRule; indexes: { origin: string } };
  metadata: { key: string; value: Metadata };
}

export type Db = IDBPDatabase<Schema>;
type Stores = StoreNames<Schema>[];
type Tx = IDBPTransaction<Schema, Stores, "readwrite">;

const ALL: Stores = ["drafts", "revisions", "sitePolicies", "fieldExclusions", "metadata"];

export const DEFAULT_META: Metadata = {
  key: "meta",
  globalEpoch: 0,
  totalBytes: 0,
  retentionDays: DEFAULT_RETENTION_DAYS,
  paused: false,
};

/**
 * Opens (and migrates) the database. A database from a newer, unknown schema
 * version raises VersionError; callers must stop saving and show a repair
 * message — never delete the database as a recovery shortcut.
 */
export function openDatabase(name = DB_NAME): Promise<Db> {
  return openDB<Schema>(name, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        const drafts = db.createObjectStore("drafts", { keyPath: "id" });
        drafts.createIndex("origin", "origin");
        drafts.createIndex("route", ["origin", "routeHash", "formKey"]);
        drafts.createIndex("session", ["origin", "documentSessionId", "routeHash", "formKey"]);
        drafts.createIndex("updatedAt", "updatedAt");
        drafts.createIndex("expiresAt", "expiresAt");
        db.createObjectStore("revisions", { keyPath: "id" }).createIndex("draftId", "draftId");
        db.createObjectStore("sitePolicies", { keyPath: "origin" });
        db.createObjectStore("fieldExclusions", { keyPath: "id" }).createIndex("origin", "origin");
        db.createObjectStore("metadata", { keyPath: "key" });
        void tx.objectStore("metadata").put({ ...DEFAULT_META });
      }
    },
  });
}

export class StorageError extends Error {
  constructor(public readonly code: "paused" | "not-enabled" | "stale" | "too-large" | "quota" | "corrupt") {
    super(code);
  }
}

async function readMeta(tx: { objectStore(n: "metadata"): { get(k: string): Promise<Metadata | undefined> } }): Promise<Metadata> {
  const raw = await tx.objectStore("metadata").get("meta");
  const parsed = metadataSchema.safeParse(raw ?? DEFAULT_META);
  if (!parsed.success) throw new StorageError("corrupt");
  return parsed.data;
}

function validDraft(raw: unknown): Draft | null {
  const p = draftSchema.safeParse(raw);
  return p.success ? p.data : null;
}

/** Runs fn in one readwrite transaction; any throw aborts every write in it. */
async function inTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = db.transaction(ALL, "readwrite");
  try {
    const result = await fn(tx);
    await tx.done;
    return result;
  } catch (e) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    await tx.done.catch(() => undefined);
    throw e;
  }
}

async function deleteDraftIn(tx: Tx, draft: Draft, meta: Metadata): Promise<void> {
  const revKeys = await tx.objectStore("revisions").index("draftId").getAllKeys(draft.id);
  await Promise.all(revKeys.map((k) => tx.objectStore("revisions").delete(k)));
  await tx.objectStore("drafts").delete(draft.id);
  meta.totalBytes = Math.max(0, meta.totalBytes - draft.byteSize);
}

/** Remove every saved instance of a field across all drafts and revisions for an origin. */
async function purgeFieldIn(tx: Tx, origin: string, fieldKey: string, meta: Metadata): Promise<void> {
  for (const raw of await tx.objectStore("drafts").index("origin").getAll(origin)) {
    const d = validDraft(raw);
    if (!d) continue;
    let bytes = 0;
    let changed = false;
    for (const rev of await tx.objectStore("revisions").index("draftId").getAll(d.id)) {
      const kept = rev.fields.filter((f) => f.fieldKey !== fieldKey);
      const updated = { ...rev, fields: kept, byteSize: byteSize(kept) };
      if (kept.length !== rev.fields.length) {
        changed = true;
        await tx.objectStore("revisions").put(updated);
      }
      bytes += updated.byteSize;
    }
    if (!changed) continue;
    const next = { ...d, byteSize: 0 };
    next.byteSize = bytes + byteSize(next);
    meta.totalBytes = Math.max(0, meta.totalBytes - d.byteSize + next.byteSize);
    await tx.objectStore("drafts").put(next);
  }
}

async function pruneExpiredIn(tx: Tx, meta: Metadata, now: number): Promise<number> {
  let removed = 0;
  for (const raw of await tx.objectStore("drafts").getAll()) {
    // Unreadable records are skipped, never shown and never bulk-deleted.
    const d = validDraft(raw);
    if (d && isExpired(d, now, meta.retentionDays)) {
      await deleteDraftIn(tx, d, meta);
      removed++;
    }
  }
  return removed;
}

export interface CommitInput {
  origin: string;
  routeHash: string;
  formKey: string;
  documentSessionId: string;
  sequence: number;
  epoch: Epoch;
  /** Hashed deltas; value null = purge that field from this draft. */
  fields: (Omit<StoredField, "value"> & { value: StoredField["value"] | null })[];
  now: number;
}

export type CommitResult =
  | { status: "committed"; draftId: string; savedAt: number; skippedFields: number }
  | { status: "duplicate"; draftId: string; savedAt: number; skippedFields: 0 }
  | { status: "noop"; skippedFields: number };

/**
 * Merge a field delta into the draft snapshot and write revision, pointer,
 * counts and byte totals in one transaction. Resolves only after commit.
 */
export async function commitEdit(db: Db, input: CommitInput): Promise<CommitResult> {
  return inTx(db, async (tx) => {
    const meta = await readMeta(tx);
    if (meta.paused) throw new StorageError("paused");
    const policyRaw = await tx.objectStore("sitePolicies").get(input.origin);
    const policy = policyRaw ? sitePolicySchema.parse(policyRaw) : undefined;
    if (!policy?.enabled) throw new StorageError("not-enabled");
    if (input.epoch.global !== meta.globalEpoch || input.epoch.site !== policy.epoch) throw new StorageError("stale");

    const excluded = new Set(
      (await tx.objectStore("fieldExclusions").index("origin").getAll(input.origin))
        .filter((r) => r.mode === "exclude")
        .map((r) => r.fieldKey),
    );

    // Fields that became sensitive, were screened, or are excluded vanish site-wide first.
    const purged = new Set(input.fields.filter((f) => f.value === null || excluded.has(f.fieldKey)).map((f) => f.fieldKey));
    for (const key of purged) await purgeFieldIn(tx, input.origin, key, meta);

    const drafts = tx.objectStore("drafts");
    const existing = validDraft(await drafts.index("session").get([input.origin, input.documentSessionId, input.routeHash, input.formKey]));
    if (existing && input.sequence <= existing.lastSequence) {
      return { status: "duplicate", draftId: existing.id, savedAt: existing.updatedAt, skippedFields: 0 };
    }

    const revisions = tx.objectStore("revisions");
    const prior: Revision | undefined = existing
      ? revisionSchema.parse(await revisions.get(existing.latestRevisionId))
      : undefined;
    const snapshot = new Map((prior?.fields ?? []).map((f) => [f.fieldKey, f]));
    let skippedFields = 0;
    for (const f of input.fields) {
      if (f.value === null || purged.has(f.fieldKey)) continue;
      if (!snapshot.has(f.fieldKey) && snapshot.size >= LIMITS.fieldsPerDraft) {
        skippedFields++;
        continue;
      }
      if (f.value.kind === "text" && byteSize(f.value.text) > LIMITS.textBytes) throw new StorageError("too-large");
      snapshot.set(f.fieldKey, { ...f, value: f.value });
    }

    if (snapshot.size === 0 && !existing) {
      await tx.objectStore("metadata").put(meta);
      return { status: "noop", skippedFields };
    }

    const fields = [...snapshot.values()];
    const revBytes = byteSize(fields);
    if (revBytes > LIMITS.revisionBytes) throw new StorageError("too-large");

    const draftId = existing?.id ?? crypto.randomUUID();
    const revision: Revision = {
      id: crypto.randomUUID(),
      draftId,
      sequence: input.sequence,
      fields,
      committedAt: input.now,
      byteSize: revBytes,
    };
    await revisions.put(revision);

    // Keep only the latest N revisions.
    const all = (await revisions.index("draftId").getAll(draftId)).sort((a, b) => b.sequence - a.sequence);
    for (const old of all.slice(LIMITS.revisionsPerDraft)) await revisions.delete(old.id);
    const kept = all.slice(0, LIMITS.revisionsPerDraft);

    const draft: Draft = {
      id: draftId,
      origin: input.origin,
      routeHash: input.routeHash,
      formKey: input.formKey,
      documentSessionId: input.documentSessionId,
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now,
      expiresAt: expiryFor(input.now, meta.retentionDays),
      latestRevisionId: revision.id,
      lastSequence: input.sequence,
      status: existing?.status ?? "active",
      byteSize: 0,
      schemaVersion: SCHEMA_VERSION,
    };
    draft.byteSize = kept.reduce((n, r) => n + r.byteSize, 0) + byteSize(draft);
    meta.totalBytes = Math.max(0, meta.totalBytes - (existing?.byteSize ?? 0)) + draft.byteSize;
    await drafts.put(draft);

    // Budgets: prune expired, then evict oldest other drafts; never evict this one.
    let count = await drafts.count();
    if (count > LIMITS.totalDrafts || meta.totalBytes > LIMITS.totalBytes) {
      await pruneExpiredIn(tx, meta, input.now);
      count = await drafts.count();
      const others = evictionOrder(
        (await drafts.getAll()).map((d) => validDraft(d)).filter((d): d is Draft => d !== null),
        draftId,
      );
      while ((count > LIMITS.totalDrafts || meta.totalBytes > LIMITS.totalBytes) && others.length > 0) {
        await deleteDraftIn(tx, others.shift()!, meta);
        count--;
      }
      if (count > LIMITS.totalDrafts || meta.totalBytes > LIMITS.totalBytes) throw new StorageError("quota");
    }
    await tx.objectStore("metadata").put(meta);
    return { status: "committed", draftId, savedAt: input.now, skippedFields };
  });
}

export async function getMeta(db: Db): Promise<Metadata> {
  return readMeta(db.transaction("metadata"));
}

export async function getPolicy(db: Db, origin: string): Promise<SitePolicy | undefined> {
  const p = sitePolicySchema.safeParse(await db.get("sitePolicies", origin));
  return p.success ? p.data : undefined;
}

export async function listPolicies(db: Db): Promise<SitePolicy[]> {
  return (await db.getAll("sitePolicies")).flatMap((r) => {
    const p = sitePolicySchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
}

export async function epochFor(db: Db, origin: string): Promise<Epoch | null> {
  const tx = db.transaction(["metadata", "sitePolicies"]);
  const meta = await readMeta(tx);
  const policy = sitePolicySchema.safeParse(await tx.objectStore("sitePolicies").get(origin));
  if (!policy.success || !policy.data.enabled) return null;
  return { global: meta.globalEpoch, site: policy.data.epoch };
}

export async function enableSite(db: Db, origin: string, now: number): Promise<void> {
  await inTx(db, async (tx) => {
    const store = tx.objectStore("sitePolicies");
    const existing = sitePolicySchema.safeParse(await store.get(origin));
    if (!existing.success && (await store.count()) >= LIMITS.sites) throw new StorageError("quota");
    await store.put({
      origin,
      enabled: true,
      epoch: existing.success ? existing.data.epoch + 1 : 0,
      keepDraftsOnRemoval: false,
      updatedAt: now,
    });
  });
}

/** Record intent before an intentional permission removal so the onRemoved event keeps drafts. */
export async function setKeepDraftsIntent(db: Db, origin: string, keep: boolean): Promise<void> {
  await inTx(db, async (tx) => {
    const p = sitePolicySchema.safeParse(await tx.objectStore("sitePolicies").get(origin));
    if (p.success) await tx.objectStore("sitePolicies").put({ ...p.data, keepDraftsOnRemoval: keep });
  });
}

/**
 * Disable capture for an origin. Bumps the site epoch so in-flight writes are
 * rejected. Deletes the site's drafts unless told to keep them.
 */
export async function disableSite(db: Db, origin: string, deleteDrafts: boolean, now: number): Promise<number> {
  return inTx(db, async (tx) => {
    const store = tx.objectStore("sitePolicies");
    const p = sitePolicySchema.safeParse(await store.get(origin));
    const epoch = p.success ? p.data.epoch + 1 : 1;
    await store.put({ origin, enabled: false, epoch, keepDraftsOnRemoval: false, updatedAt: now });
    const meta = await readMeta(tx);
    let removed = 0;
    if (deleteDrafts) {
      for (const d of await tx.objectStore("drafts").index("origin").getAll(origin)) {
        await deleteDraftIn(tx, d, meta);
        removed++;
      }
    }
    await tx.objectStore("metadata").put(meta);
    return removed;
  });
}

export async function deleteSiteDrafts(db: Db, origin: string): Promise<number> {
  return inTx(db, async (tx) => {
    const store = tx.objectStore("sitePolicies");
    const p = sitePolicySchema.safeParse(await store.get(origin));
    if (p.success) await store.put({ ...p.data, epoch: p.data.epoch + 1 });
    const meta = await readMeta(tx);
    const drafts = await tx.objectStore("drafts").index("origin").getAll(origin);
    for (const d of drafts) await deleteDraftIn(tx, d, meta);
    await tx.objectStore("metadata").put(meta);
    return drafts.length;
  });
}

export async function deleteAllDrafts(db: Db): Promise<void> {
  await inTx(db, async (tx) => {
    const meta = await readMeta(tx);
    await tx.objectStore("drafts").clear();
    await tx.objectStore("revisions").clear();
    await tx.objectStore("metadata").put({ ...meta, globalEpoch: meta.globalEpoch + 1, totalBytes: 0 });
  });
}

export async function deleteDraft(db: Db, draftId: string): Promise<boolean> {
  return inTx(db, async (tx) => {
    const d = validDraft(await tx.objectStore("drafts").get(draftId));
    if (!d) return false;
    const meta = await readMeta(tx);
    await deleteDraftIn(tx, d, meta);
    await tx.objectStore("metadata").put(meta);
    return true;
  });
}

export async function pruneExpired(db: Db, now: number): Promise<number> {
  return inTx(db, async (tx) => {
    const meta = await readMeta(tx);
    const n = await pruneExpiredIn(tx, meta, now);
    await tx.objectStore("metadata").put(meta);
    return n;
  });
}

export async function setRetention(db: Db, days: 1 | 7 | 30, now: number): Promise<number> {
  return inTx(db, async (tx) => {
    const meta = await readMeta(tx);
    meta.retentionDays = days;
    const n = await pruneExpiredIn(tx, meta, now);
    await tx.objectStore("metadata").put(meta);
    return n;
  });
}

/** Pausing bumps the global epoch so buffered edits from before the pause can never land. */
export async function setPaused(db: Db, paused: boolean): Promise<void> {
  await inTx(db, async (tx) => {
    const meta = await readMeta(tx);
    await tx.objectStore("metadata").put({ ...meta, paused, globalEpoch: meta.globalEpoch + 1 });
  });
}

/** Non-expired drafts, validated on read. */
export async function listDrafts(db: Db, now: number): Promise<Draft[]> {
  const meta = await getMeta(db);
  return (await db.getAll("drafts"))
    .map(validDraft)
    .filter((d): d is Draft => d !== null && !isExpired(d, now, meta.retentionDays))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDraft(db: Db, draftId: string, now: number): Promise<{ draft: Draft; revision: Revision } | null> {
  const meta = await getMeta(db);
  const draft = validDraft(await db.get("drafts", draftId));
  if (!draft || isExpired(draft, now, meta.retentionDays)) return null;
  const rev = revisionSchema.safeParse(await db.get("revisions", draft.latestRevisionId));
  return rev.success ? { draft, revision: rev.data } : null;
}

/** Current-page candidates: exact origin and route, excluding the asking document's own drafts. */
export async function candidateDrafts(db: Db, origin: string, routeHash: string, ownSessionId: string | null, now: number): Promise<Draft[]> {
  return (await listDrafts(db, now)).filter(
    (d) => d.origin === origin && d.routeHash === routeHash && d.documentSessionId !== ownSessionId,
  );
}

export async function markSubmitted(db: Db, key: { documentSessionId: string; routeHash: string; formKey: string; origin: string }): Promise<void> {
  await inTx(db, async (tx) => {
    const d = validDraft(await tx.objectStore("drafts").index("session").get([key.origin, key.documentSessionId, key.routeHash, key.formKey]));
    if (d) await tx.objectStore("drafts").put({ ...d, status: "submission-attempted" });
  });
}

export async function listFieldRules(db: Db, origin: string): Promise<FieldRule[]> {
  return (await db.getAllFromIndex("fieldExclusions", "origin", origin)).flatMap((r) => {
    const p = fieldRuleSchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
}

/**
 * Store an opaque field rule. An exclusion also removes every saved instance
 * of that field across all revisions for the site and bumps the site epoch.
 */
export async function addFieldRule(db: Db, origin: string, fieldKey: string, mode: FieldRule["mode"], now: number): Promise<void> {
  await inTx(db, async (tx) => {
    const rules = tx.objectStore("fieldExclusions");
    if ((await rules.count()) >= LIMITS.fieldRules) throw new StorageError("quota");
    await rules.put({ id: `${mode}|${origin}|${fieldKey}`, origin, fieldKey, mode, createdAt: now });
    if (mode !== "exclude") return;
    const policy = sitePolicySchema.safeParse(await tx.objectStore("sitePolicies").get(origin));
    if (policy.success) await tx.objectStore("sitePolicies").put({ ...policy.data, epoch: policy.data.epoch + 1 });
    const meta = await readMeta(tx);
    await purgeFieldIn(tx, origin, fieldKey, meta);
    await tx.objectStore("metadata").put(meta);
  });
}

export async function stats(db: Db, now: number): Promise<{ drafts: number; bytes: number; sites: number }> {
  const [drafts, meta, sites] = await Promise.all([listDrafts(db, now), getMeta(db), listPolicies(db)]);
  return { drafts: drafts.length, bytes: meta.totalBytes, sites: sites.filter((s) => s.enabled).length };
}
