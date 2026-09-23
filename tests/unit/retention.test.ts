import { describe, expect, it } from "vitest";
import { DAY_MS, evictionOrder, expiryFor, isExpired } from "@form-rescue/core";

const now = Date.UTC(2026, 8, 24);

describe("retention", () => {
  it("expires at updatedAt + retention", () => {
    const d = { updatedAt: now - 7 * DAY_MS, expiresAt: expiryFor(now - 7 * DAY_MS, 7) };
    expect(isExpired(d, now - 1, 7)).toBe(false);
    expect(isExpired(d, now, 7)).toBe(true);
  });

  it("reducing retention prunes immediately", () => {
    const d = { updatedAt: now - 2 * DAY_MS, expiresAt: expiryFor(now - 2 * DAY_MS, 7) };
    expect(isExpired(d, now, 7)).toBe(false);
    expect(isExpired(d, now, 1)).toBe(true);
  });

  it("expanding retention never extends a stored expiry", () => {
    const d = { updatedAt: now - 2 * DAY_MS, expiresAt: expiryFor(now - 2 * DAY_MS, 1) };
    expect(isExpired(d, now, 30)).toBe(true);
  });

  it("clock moved backwards: far-future timestamps are expired conservatively", () => {
    const future = now + 3 * DAY_MS;
    expect(isExpired({ updatedAt: future, expiresAt: expiryFor(future, 7) }, now, 7)).toBe(true);
    const slight = now + 1000;
    expect(isExpired({ updatedAt: slight, expiresAt: expiryFor(slight, 7) }, now, 7)).toBe(false);
  });

  it("eviction order is oldest first and never includes the protected draft", () => {
    const ds = [
      { id: "c", updatedAt: 3 },
      { id: "a", updatedAt: 1 },
      { id: "b", updatedAt: 1 },
      { id: "p", updatedAt: 0 },
    ];
    expect(evictionOrder(ds, "p").map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(evictionOrder(ds).map((d) => d.id)).toEqual(["p", "a", "b", "c"]);
  });
});
