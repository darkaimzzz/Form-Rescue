import { beforeEach, describe, expect, it } from "vitest";
import { openDB } from "idb";
import { DAY_MS, LIMITS, type StoredField } from "@form-rescue/core";
import {
  addFieldRule,
  candidateDrafts,
  commitEdit,
  deleteAllDrafts,
  deleteDraft,
  deleteSiteDrafts,
  disableSite,
  enableSite,
  epochFor,
  getDraft,
  getMeta,
  listDrafts,
  markSubmitted,
  openDatabase,
  pruneExpired,
  setPaused,
  setRetention,
  StorageError,
  type CommitInput,
  type Db,
} from "@form-rescue/storage";

const ORIGIN = "https://fixture.test";
const SENTINEL = "SYNTHETIC-DRAFT-TEXT";
let db: Db;
let dbName: string;
let now = Date.UTC(2026, 8, 24);

function field(key: string, text: string, editedAt = now): StoredField {
  return { fieldKey: key, kind: "text", identity: { groupHash: "g", ordinal: 0 }, genericLabel: "Text field 1", value: { kind: "text", text }, editedAt };
}

async function input(o: Partial<CommitInput> = {}): Promise<CommitInput> {
  const epoch = (await epochFor(db, o.origin ?? ORIGIN)) ?? { global: 0, site: 0 };
  return { origin: ORIGIN, routeHash: "r1", formKey: "f1", documentSessionId: "session-1", sequence: 1, epoch, fields: [field("k1", SENTINEL)], now, ...o };
}

beforeEach(async () => {
  dbName = `t-${crypto.randomUUID()}`;
  db = await openDatabase(dbName);
  now = Date.UTC(2026, 8, 24);
  await enableSite(db, ORIGIN, now);
});

describe("commits", () => {
  it("commits and acknowledges only after the transaction completes", async () => {
    const r = await commitEdit(db, await input());
    expect(r.status).toBe("committed");
    // A fresh connection sees the committed data (durable, not in-memory state).
    const db2 = await openDatabase(dbName);
    const drafts = await listDrafts(db2, now);
    expect(drafts).toHaveLength(1);
    const full = await getDraft(db2, drafts[0]!.id, now);
    expect(full?.revision.fields[0]?.value).toEqual({ kind: "text", text: SENTINEL });
  });

  it("merges deltas and keeps explicit empty values", async () => {
    await commitEdit(db, await input({ fields: [field("k1", "a"), field("k2", "b")] }));
    await commitEdit(db, await input({ sequence: 2, fields: [field("k2", "")] }));
    const [d] = await listDrafts(db, now);
    const full = await getDraft(db, d!.id, now);
    expect(full!.revision.fields.map((f) => f.value)).toEqual([
      { kind: "text", text: "a" },
      { kind: "text", text: "" },
    ]);
  });

  it("duplicate and older sequences are idempotent and never replace newer snapshots", async () => {
    await commitEdit(db, await input({ sequence: 2, fields: [field("k1", "new")] }));
    const dup = await commitEdit(db, await input({ sequence: 2, fields: [field("k1", "new")] }));
    const old = await commitEdit(db, await input({ sequence: 1, fields: [field("k1", "old")] }));
    expect(dup.status).toBe("duplicate");
    expect(old.status).toBe("duplicate");
    const [d] = await listDrafts(db, now);
    expect((await getDraft(db, d!.id, now))!.revision.fields[0]!.value).toEqual({ kind: "text", text: "new" });
  });

  it("keeps only the latest 3 revisions", async () => {
    for (let s = 1; s <= 5; s++) await commitEdit(db, await input({ sequence: s, fields: [field("k1", `v${s}`)] }));
    const all = await db.getAll("revisions");
    expect(all.map((r) => r.sequence).sort()).toEqual([3, 4, 5]);
  });

  it("two tabs on the same form produce two drafts, never merged", async () => {
    await commitEdit(db, await input({ documentSessionId: "session-A", fields: [field("k1", "tab A")] }));
    await commitEdit(db, await input({ documentSessionId: "session-B", fields: [field("k1", "tab B")] }));
    expect(await listDrafts(db, now)).toHaveLength(2);
    expect(await candidateDrafts(db, ORIGIN, "r1", "session-A", now)).toHaveLength(1);
  });

  it("route and origin isolate candidates", async () => {
    await commitEdit(db, await input());
    expect(await candidateDrafts(db, ORIGIN, "r2", null, now)).toHaveLength(0);
    expect(await candidateDrafts(db, "https://other.test", "r1", null, now)).toHaveLength(0);
    expect(await candidateDrafts(db, ORIGIN, "r1", null, now)).toHaveLength(1);
  });

  it("rejects writes for disabled sites, paused capture, and stale epochs", async () => {
    await expect(commitEdit(db, await input({ origin: "https://not-enabled.test" }))).rejects.toMatchObject({ code: "not-enabled" });
    const stale = await input();
    await deleteSiteDrafts(db, ORIGIN);
    await expect(commitEdit(db, stale)).rejects.toMatchObject({ code: "stale" });
    await setPaused(db, true);
    await expect(commitEdit(db, await input())).rejects.toMatchObject({ code: "paused" });
  });

  it("rejects an oversize value without silently truncating", async () => {
    const big = "x".repeat(LIMITS.textBytes + 1);
    await expect(commitEdit(db, await input({ fields: [field("k1", big)] }))).rejects.toBeInstanceOf(StorageError);
    expect(await listDrafts(db, now)).toHaveLength(0);
  });

  it("counts UTF-8 bytes, not characters", async () => {
    const emoji = "😀".repeat(LIMITS.textBytes / 4 + 1); // 4 bytes each, fewer chars than the limit
    await expect(commitEdit(db, await input({ fields: [field("k1", emoji)] }))).rejects.toMatchObject({ code: "too-large" });
  });

  it("rejects a revision over 256 KiB", async () => {
    const chunk = "y".repeat(60 * 1024);
    const fields = [0, 1, 2, 3, 4].map((i) => field(`k${i}`, chunk));
    await expect(commitEdit(db, await input({ fields }))).rejects.toMatchObject({ code: "too-large" });
  });

  it("caps fields per draft and reports skipped count", async () => {
    const fields = Array.from({ length: LIMITS.fieldsPerDraft + 3 }, (_, i) => field(`k${i}`, "v"));
    const r = await commitEdit(db, await input({ fields: fields.slice(0, 100) }));
    expect(r.skippedFields).toBe(0);
    const r2 = await commitEdit(db, await input({ sequence: 2, fields: fields.slice(100) }));
    expect(r2.skippedFields).toBe(3);
  });

  it("aborted transaction leaves no partial writes", async () => {
    await commitEdit(db, await input({ fields: [field("k1", "keep")] }));
    const before = await db.getAll("revisions");
    await expect(
      commitEdit(db, await input({ sequence: 2, fields: [field("k1", "keep2"), field("k2", "z".repeat(LIMITS.textBytes + 10))] })),
    ).rejects.toThrow();
    expect(await db.getAll("revisions")).toEqual(before);
  });

  it("marks submission attempts but retains the draft", async () => {
    await commitEdit(db, await input());
    await markSubmitted(db, { documentSessionId: "session-1", routeHash: "r1", formKey: "f1", origin: ORIGIN });
    const [d] = await listDrafts(db, now);
    expect(d!.status).toBe("submission-attempted");
  });
});

describe("deletion and epochs", () => {
  it("deleting all increments the global epoch; buffered writes cannot resurrect data", async () => {
    await commitEdit(db, await input());
    const inflight = await input({ sequence: 2, fields: [field("k1", "buffered before delete")] });
    await deleteAllDrafts(db);
    expect(await listDrafts(db, now)).toHaveLength(0);
    await expect(commitEdit(db, inflight)).rejects.toMatchObject({ code: "stale" });
    expect(await db.getAll("revisions")).toHaveLength(0);
    // Only a fresh handshake (new epoch) may create a new draft.
    expect((await commitEdit(db, await input({ sequence: 3 }))).status).toBe("committed");
  });

  it("per-draft and per-site deletion", async () => {
    await commitEdit(db, await input());
    await enableSite(db, "https://b.test", now);
    await commitEdit(db, await input({ origin: "https://b.test" }));
    await commitEdit(db, await input({ documentSessionId: "session-2" }));
    const b = (await listDrafts(db, now)).find((x) => x.origin === "https://b.test")!;
    expect(await deleteDraft(db, b.id)).toBe(true);
    expect(await deleteDraft(db, b.id)).toBe(false);
    expect(await deleteSiteDrafts(db, ORIGIN)).toBe(2);
    expect(await listDrafts(db, now)).toHaveLength(0);
    expect((await getMeta(db)).totalBytes).toBeGreaterThanOrEqual(0);
  });

  it("disable site: delete by default, keep when chosen; both invalidate in-flight writes", async () => {
    await commitEdit(db, await input());
    const inflight = await input({ sequence: 2 });
    expect(await disableSite(db, ORIGIN, false, now)).toBe(0);
    expect(await listDrafts(db, now)).toHaveLength(1);
    await expect(commitEdit(db, inflight)).rejects.toMatchObject({ code: "not-enabled" });
    await enableSite(db, ORIGIN, now);
    expect(await disableSite(db, ORIGIN, true, now)).toBe(1);
    expect(await listDrafts(db, now)).toHaveLength(0);
    expect(await epochFor(db, ORIGIN)).toBeNull();
  });

  it("field exclusion deletes that field across all revisions and blocks future saves of it", async () => {
    await commitEdit(db, await input({ fields: [field("k1", SENTINEL), field("k2", "keep")] }));
    await commitEdit(db, await input({ sequence: 2, fields: [field("k1", SENTINEL + "2")] }));
    await addFieldRule(db, ORIGIN, "k1", "exclude", now);
    for (const rev of await db.getAll("revisions")) expect(JSON.stringify(rev)).not.toContain(SENTINEL);
    await commitEdit(db, await input({ sequence: 3, fields: [field("k1", SENTINEL + "3"), field("k2", "keep2")] }));
    for (const rev of await db.getAll("revisions")) expect(JSON.stringify(rev)).not.toContain(SENTINEL);
  });

  it("a null value purges the field from all revisions (became sensitive)", async () => {
    await commitEdit(db, await input({ fields: [field("k1", SENTINEL), field("k2", "keep")] }));
    await commitEdit(db, await input({ sequence: 2, fields: [{ ...field("k1", ""), value: null } as unknown as StoredField] }));
    for (const rev of await db.getAll("revisions")) expect(JSON.stringify(rev)).not.toContain(SENTINEL);
  });

  it("concurrent delete during pending commit: whichever order, no resurrection", async () => {
    await commitEdit(db, await input());
    const pending = commitEdit(db, await input({ sequence: 2, fields: [field("k1", "racing")] })).catch((e: unknown) => e);
    const del = deleteAllDrafts(db);
    await Promise.all([pending, del]);
    // Delete was issued after the commit request; IndexedDB serializes the transactions.
    expect(await listDrafts(db, now)).toHaveLength(0);
  });
});

describe("retention and budgets", () => {
  it("expired drafts are hidden before pruning and removed by pruning", async () => {
    await commitEdit(db, await input());
    const later = now + 7 * DAY_MS;
    expect(await listDrafts(db, later)).toHaveLength(0);
    expect(await db.count("drafts")).toBe(1);
    expect(await pruneExpired(db, later)).toBe(1);
    expect(await db.count("drafts")).toBe(0);
    expect(await db.count("revisions")).toBe(0);
    expect((await getMeta(db)).totalBytes).toBe(0);
  });

  it("reducing retention prunes immediately", async () => {
    await commitEdit(db, await input({ now: now - 2 * DAY_MS }));
    expect(await setRetention(db, 1, now)).toBe(1);
    expect((await getMeta(db)).retentionDays).toBe(1);
  });

  it("evicts the oldest inactive draft beyond 200 drafts, never the one being written", async () => {
    for (let i = 0; i < LIMITS.totalDrafts; i++) {
      await commitEdit(db, await input({ documentSessionId: `session-${i}`, now: now + i }));
    }
    await commitEdit(db, await input({ documentSessionId: "session-new", now: now + 1000 }));
    const drafts = await listDrafts(db, now + 1000);
    expect(drafts).toHaveLength(LIMITS.totalDrafts);
    expect(drafts.some((d) => d.documentSessionId === "session-0")).toBe(false);
    expect(drafts.some((d) => d.documentSessionId === "session-new")).toBe(true);
  }, 60_000);

  it("byte accounting returns to zero after deleting everything", async () => {
    await commitEdit(db, await input({ fields: [field("k1", "abc")] }));
    expect((await getMeta(db)).totalBytes).toBeGreaterThan(0);
    await deleteAllDrafts(db);
    expect((await getMeta(db)).totalBytes).toBe(0);
  });
});

describe("migrations and corruption", () => {
  it("opening an existing v1 database preserves data", async () => {
    await commitEdit(db, await input());
    db.close();
    const again = await openDatabase(dbName);
    expect(await listDrafts(again, now)).toHaveLength(1);
  });

  it("a newer unknown schema version fails without destroying data", async () => {
    const name = `future-${crypto.randomUUID()}`;
    const future = await openDB(name, 5, { upgrade: (d) => void d.createObjectStore("drafts", { keyPath: "id" }) });
    await future.put("drafts", { id: "x" });
    future.close();
    await expect(openDatabase(name)).rejects.toMatchObject({ name: "VersionError" });
    const check = await openDB(name, 5);
    expect(await check.count("drafts")).toBe(1);
  });

  it("corrupt records are never exposed", async () => {
    await commitEdit(db, await input());
    await db.put("drafts", { id: "bad", origin: ORIGIN, junk: true } as never);
    const drafts = await listDrafts(db, now);
    expect(drafts.map((d) => d.id)).not.toContain("bad");
    expect(await getDraft(db, "bad", now)).toBeNull();
  });
});
