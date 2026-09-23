/**
 * Sender authorization. Context always comes from browser-provided sender
 * information, never from payload fields.
 */

export interface SenderLike {
  id?: string;
  url?: string;
  frameId?: number;
  documentId?: string;
  tab?: { id?: number; incognito?: boolean };
}

export type SenderContext =
  | { kind: "content"; tabId: number; origin: string; url: string; documentId?: string }
  | { kind: "ui" }
  | { kind: "rejected"; reason: "foreign-extension" | "incognito" | "frame" | "scheme" | "unknown" };

export function classifySender(sender: SenderLike, runtimeId: string, extensionOrigin: string): SenderContext {
  if (sender.id !== runtimeId) return { kind: "rejected", reason: "foreign-extension" };
  const url = sender.url ?? "";
  if (url.startsWith(extensionOrigin)) return { kind: "ui" };
  if (!sender.tab || typeof sender.tab.id !== "number") return { kind: "rejected", reason: "unknown" };
  if (sender.tab.incognito) return { kind: "rejected", reason: "incognito" };
  if (sender.frameId !== 0) return { kind: "rejected", reason: "frame" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "rejected", reason: "scheme" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { kind: "rejected", reason: "scheme" };
  const ctx: SenderContext = { kind: "content", tabId: sender.tab.id, origin: parsed.origin, url };
  if (sender.documentId) ctx.documentId = sender.documentId;
  return ctx;
}

export interface Capability {
  tabId: number;
  origin: string;
  documentSessionId: string;
  documentId?: string;
}

/** A capability is valid only for the exact tab, origin and (when the browser reports it) document it was issued to. */
export function capabilityMatches(cap: Capability | undefined, ctx: Extract<SenderContext, { kind: "content" }>, payloadUrl: string): boolean {
  if (!cap) return false;
  if (cap.tabId !== ctx.tabId || cap.origin !== ctx.origin) return false;
  if (cap.documentId && ctx.documentId && cap.documentId !== ctx.documentId) return false;
  try {
    return new URL(payloadUrl).origin === ctx.origin;
  } catch {
    return false;
  }
}

/** Simple sliding-window rate limit per key. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}
  allow(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
