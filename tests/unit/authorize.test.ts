import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { contentMessageSchema, LIMITS, parseMessage, toContentMessageSchema, uiMessageSchema } from "@form-rescue/core";
import { capabilityMatches, classifySender, RateLimiter } from "../../apps/extension/src/background/authorize.js";

const RID = "ext-id";
const EXT = "chrome-extension://ext-id/";
const tab = { id: 7, incognito: false };

describe("classifySender", () => {
  it("rejects other extensions", () => {
    expect(classifySender({ id: "other", url: EXT }, RID, EXT)).toEqual({ kind: "rejected", reason: "foreign-extension" });
  });
  it("extension pages are UI, even when opened in a tab", () => {
    expect(classifySender({ id: RID, url: `${EXT}pages/library/index.html`, tab }, RID, EXT)).toEqual({ kind: "ui" });
  });
  it("top-frame http(s) content scripts are content senders, with origin from the sender", () => {
    expect(classifySender({ id: RID, url: "https://a.test/p?q#h", frameId: 0, tab, documentId: "d1" }, RID, EXT)).toEqual({
      kind: "content",
      tabId: 7,
      origin: "https://a.test",
      url: "https://a.test/p?q#h",
      documentId: "d1",
    });
  });
  it.each([
    [{ id: RID, url: "https://a.test/", frameId: 3, tab }, "frame"],
    [{ id: RID, url: "https://a.test/", frameId: 0, tab: { id: 1, incognito: true } }, "incognito"],
    [{ id: RID, url: "file:///c:/x.html", frameId: 0, tab }, "scheme"],
    [{ id: RID, url: "not a url", frameId: 0, tab }, "scheme"],
    [{ id: RID, url: "https://a.test/", frameId: 0 }, "unknown"],
    [{ id: RID, url: "https://a.test/", frameId: 0, tab: {} }, "unknown"],
  ])("rejects %o (%s)", (sender, reason) => {
    expect(classifySender(sender, RID, EXT)).toEqual({ kind: "rejected", reason });
  });
});

describe("capabilityMatches", () => {
  const ctx = { kind: "content" as const, tabId: 7, origin: "https://a.test", url: "https://a.test/x", documentId: "d1" };
  const cap = { tabId: 7, origin: "https://a.test", documentSessionId: "s", documentId: "d1" };
  it("accepts the exact tab/origin/document", () => {
    expect(capabilityMatches(cap, ctx, "https://a.test/other")).toBe(true);
  });
  it.each([
    ["missing", undefined, ctx, "https://a.test/"],
    ["other tab", { ...cap, tabId: 8 }, ctx, "https://a.test/"],
    ["other origin", { ...cap, origin: "https://b.test" }, ctx, "https://a.test/"],
    ["stale document", { ...cap, documentId: "d0" }, ctx, "https://a.test/"],
    ["forged payload origin", cap, ctx, "https://b.test/"],
    ["bad payload url", cap, ctx, "::"],
  ])("rejects %s", (_n, c, x, u) => {
    expect(capabilityMatches(c, x, u)).toBe(false);
  });
  it("tolerates browsers without documentId", () => {
    const { documentId: _d, ...noDoc } = ctx;
    expect(capabilityMatches(cap, noDoc, "https://a.test/")).toBe(true);
  });
});

describe("message schemas", () => {
  it("reject unknown properties and unknown types", () => {
    expect(parseMessage(uiMessageSchema, { type: "listDrafts", extra: 1 }).ok).toBe(false);
    expect(parseMessage(uiMessageSchema, { type: "dumpEverything" }).ok).toBe(false);
    expect(parseMessage(contentMessageSchema, { type: "listDrafts" }).ok).toBe(false);
    expect(parseMessage(toContentMessageSchema, { type: "apply", capability: "abcdefgh", restoreId: "abcdefgh", items: [], html: "<b>" }).ok).toBe(false);
  });
  it("rejects oversized payloads before parsing", () => {
    expect(parseMessage(uiMessageSchema, { type: "getDraft", draftId: "x".repeat(LIMITS.messageBytes) })).toEqual({ ok: false, error: "too-large" });
  });
  it("rejects unserializable payloads", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(parseMessage(uiMessageSchema, loop)).toEqual({ ok: false, error: "unserializable" });
  });
  it("content scripts cannot request drafts: no draft-reading message exists in the content schema", () => {
    for (const type of ["getDraft", "listDrafts", "planRestore", "restore", "deleteAll"]) {
      expect(parseMessage(contentMessageSchema, { type, draftId: "abcdefgh1" }).ok).toBe(false);
    }
  });
  it("property: arbitrary objects never parse into a message with extra keys", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ maxLength: 8 }), fc.jsonValue()), (obj) => {
        for (const schema of [uiMessageSchema, contentMessageSchema, toContentMessageSchema]) {
          const r = parseMessage(schema as never, obj);
          if (r.ok) expect(Object.keys(r.data as object).every((k) => k in obj)).toBe(true);
        }
      }),
    );
  });
});

describe("RateLimiter", () => {
  it("limits bursts per key and recovers after the window", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("a", 1)).toBe(true);
    expect(rl.allow("a", 2)).toBe(false);
    expect(rl.allow("b", 2)).toBe(true);
    expect(rl.allow("a", 1001)).toBe(true);
  });
});
