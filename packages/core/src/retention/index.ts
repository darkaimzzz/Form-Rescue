import { DAY_MS } from "../schemas/index.js";

/** Tolerated forward clock skew before a timestamp is treated as untrustworthy. */
export const MAX_FUTURE_SKEW_MS = DAY_MS;

export function expiryFor(updatedAt: number, retentionDays: number): number {
  return updatedAt + retentionDays * DAY_MS;
}

/**
 * Effective expiry never extends a stored expiry (expanding retention cannot
 * resurrect a draft) but shrinks immediately when retention is reduced.
 * A draft timestamped far in the future (clock moved backwards) is expired
 * conservatively rather than kept indefinitely.
 */
export function isExpired(d: { updatedAt: number; expiresAt: number }, now: number, retentionDays: number): boolean {
  if (d.updatedAt > now + MAX_FUTURE_SKEW_MS) return true;
  return now >= Math.min(d.expiresAt, expiryFor(d.updatedAt, retentionDays));
}

/** Eviction order: oldest last edit first, never the draft being written. */
export function evictionOrder<T extends { id: string; updatedAt: number }>(drafts: T[], protectedId?: string): T[] {
  return drafts.filter((d) => d.id !== protectedId).sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id));
}
