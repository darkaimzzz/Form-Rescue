import {
  contentMessageSchema,
  expiryFor,
  fieldIdentity,
  formKey as computeFormKey,
  genericLabel,
  LIMITS,
  matchFields,
  parseMessage,
  routeHash as computeRouteHash,
  uiMessageSchema,
  type ApplyOutcome,
  type ContentMessage,
  type Epoch,
  type FieldValue,
  type Hasher,
  type PageField,
  type UiMessage,
} from "@form-rescue/core";
import * as store from "@form-rescue/storage";
import { StorageError, type Db } from "@form-rescue/storage";
import { ext, isFirefox, isSupportedUrl, originPattern } from "../platform/browser.js";
import { capabilityMatches, classifySender, RateLimiter, type Capability, type SenderContext } from "./authorize.js";

// ---------------------------------------------------------------------------
// Lazily initialised state. Workers can stop at any time: everything
// authoritative lives in IndexedDB; the maps below are rebuildable caches.
// ---------------------------------------------------------------------------

let dbPromise: Promise<Db> | null = null;
let dbError: string | null = null;
function db(): Promise<Db> {
  dbPromise ??= store.openDatabase().catch((e: unknown) => {
    dbPromise = null;
    dbError = e instanceof Error && e.name === "VersionError" ? "schema-too-new" : "open-failed";
    throw new StorageError("corrupt");
  });
  return dbPromise;
}

let hasherPromise: Promise<Hasher> | null = null;
function hasher(): Promise<Hasher> {
  hasherPromise ??= (async () => {
    const got = await ext.storage.local.get("hmacKey");
    let raw = typeof got.hmacKey === "string" ? Uint8Array.from(atob(got.hmacKey), (c) => c.charCodeAt(0)) : null;
    if (!raw || raw.length !== 32) {
      raw = crypto.getRandomValues(new Uint8Array(32));
      await ext.storage.local.set({ hmacKey: btoa(String.fromCharCode(...raw)) });
    }
    const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return async (input: string) => {
      const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input)));
      return btoa(String.fromCharCode(...sig.subarray(0, 18))).replace(/\+/g, "-").replace(/\//g, "_");
    };
  })();
  return hasherPromise;
}

const capabilities = new Map<string, Capability>();
const limiter = new RateLimiter(40, 10_000);

interface PlanItem {
  fieldKey: string;
  kind: FieldValue["kind"];
  label: string;
  saved: FieldValue;
  status: "direct" | "manual";
  reason?: string;
  ref?: number;
  current?: FieldValue;
  currentLabel?: string;
  fingerprint?: string;
}
interface Plan {
  planId: string;
  tabId: number;
  capability: string;
  origin: string;
  routeHash: string;
  draftId: string;
  epoch: Epoch;
  items: PlanItem[];
  restoreId?: string;
  createdAt: number;
}
interface FieldSession {
  planId: string;
  tabId: number;
  origin: string;
  fields: Map<number, { fieldKey: string }>;
}
const plans = new Map<string, Plan>();
const fieldSessions = new Map<string, FieldSession>();
const PLAN_TTL_MS = 15 * 60 * 1000;

const now = () => Date.now();
const newId = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Script registration
// ---------------------------------------------------------------------------

const scriptId = (origin: string) => `fr-${new URL(origin).protocol.replace(":", "")}-${new URL(origin).hostname}`.replace(/[^A-Za-z0-9_.-]/g, "_");

async function registerFor(origin: string): Promise<void> {
  const id = scriptId(origin);
  const existing = await ext.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length > 0) return;
  await ext.scripting.registerContentScripts([
    { id, matches: [originPattern(origin)], js: ["content.js"], runAt: "document_start", allFrames: false },
  ]);
}

async function unregisterFor(origin: string): Promise<void> {
  const policies = await store.listPolicies(await db());
  const pattern = originPattern(origin);
  // Another enabled origin on the same scheme+host (different port) still needs the script.
  if (policies.some((p) => p.enabled && p.origin !== origin && originPattern(p.origin) === pattern)) return;
  await ext.scripting.unregisterContentScripts({ ids: [scriptId(origin)] }).catch(() => undefined);
}

/** Reconcile registrations with policy + permission on install/update/startup. */
async function reconcile(): Promise<void> {
  const d = await db();
  await store.pruneExpired(d, now());
  const registered = await ext.scripting.getRegisteredContentScripts();
  const wanted = new Set<string>();
  for (const p of await store.listPolicies(d)) {
    if (!p.enabled) continue;
    const granted = await ext.permissions.contains({ origins: [originPattern(p.origin)] });
    if (!granted) {
      // Revoked while we were not running: fail closed.
      await store.disableSite(d, p.origin, !p.keepDraftsOnRemoval, now());
      continue;
    }
    wanted.add(scriptId(p.origin));
    await registerFor(p.origin);
  }
  const stale = registered.filter((r) => !wanted.has(r.id)).map((r) => r.id);
  if (stale.length) await ext.scripting.unregisterContentScripts({ ids: stale });
}

// ---------------------------------------------------------------------------
// Content script messaging
// ---------------------------------------------------------------------------

async function toContent<T>(tabId: number, msg: unknown): Promise<T | null> {
  try {
    return (await ext.tabs.sendMessage(tabId, msg, { frameId: 0 })) as T;
  } catch {
    return null;
  }
}

async function broadcast(filter: (c: Capability) => boolean, msg: { type: "invalidate" | "stop" }): Promise<void> {
  const tabs = new Set<number>();
  for (const [key, c] of capabilities) {
    if (!filter(c)) continue;
    capabilities.delete(key);
    tabs.add(c.tabId);
  }
  await Promise.all([...tabs].map((t) => toContent(t, msg)));
}

async function setBadge(tabId: number, count: number): Promise<void> {
  try {
    await ext.action.setBadgeText({ tabId, text: count > 0 ? String(Math.min(count, 99)) : "" });
    await ext.action.setBadgeBackgroundColor({ tabId, color: "#006B5B" });
  } catch {
    /* tab closed */
  }
}

async function hashFields(h: Hasher, fKey: string, fields: { descriptor: PageField["descriptor"] }[]) {
  return Promise.all(fields.map((f) => fieldIdentity(h, fKey, f.descriptor)));
}

async function handleContent(msg: ContentMessage, ctx: Extract<SenderContext, { kind: "content" }>): Promise<unknown> {
  const d = await db();
  if (msg.type === "handshake") {
    if (new URL(msg.url).origin !== ctx.origin) return { ok: false, error: "origin-mismatch" };
    const meta = await store.getMeta(d);
    if (meta.paused) return { ok: false, error: "paused" };
    const epoch = await store.epochFor(d, ctx.origin);
    if (!epoch) return { ok: false, error: "not-enabled" };
    if (!(await ext.permissions.contains({ origins: [originPattern(ctx.origin)] }))) return { ok: false, error: "not-enabled" };
    // One live capability per tab document.
    for (const [key, c] of capabilities) if (c.tabId === ctx.tabId) capabilities.delete(key);
    const capability = newId();
    const cap: Capability = { tabId: ctx.tabId, origin: ctx.origin, documentSessionId: msg.documentSessionId };
    if (ctx.documentId) cap.documentId = ctx.documentId;
    capabilities.set(capability, cap);
    const h = await hasher();
    const candidates = await store.candidateDrafts(d, ctx.origin, await computeRouteHash(h, msg.url), msg.documentSessionId, now());
    await setBadge(ctx.tabId, candidates.length);
    return { ok: true, capability, epoch };
  }

  const cap = capabilities.get(msg.capability);
  if (!capabilityMatches(cap, ctx, msg.url)) return { ok: false, error: "stale-capability" };
  const h = await hasher();

  if (msg.type === "commit") {
    if (!(await ext.permissions.contains({ origins: [originPattern(ctx.origin)] }))) return { ok: false, error: "revoked" };
    const fKey = await computeFormKey(h, msg.form);
    const ids = await hashFields(h, fKey, msg.fields);
    try {
      const result = await store.commitEdit(d, {
        origin: ctx.origin,
        routeHash: await computeRouteHash(h, msg.url),
        formKey: fKey,
        documentSessionId: cap!.documentSessionId,
        sequence: msg.sequence,
        epoch: msg.epoch,
        now: now(),
        fields: msg.fields.map((f, i) => ({
          ...ids[i]!,
          kind: f.descriptor.kind,
          genericLabel: genericLabel(f.descriptor.kind, f.descriptor.ordinal),
          value: f.value,
          editedAt: Math.min(f.editedAt, now()),
        })),
      });
      return { ok: true, status: result.status, savedAt: "savedAt" in result ? result.savedAt : null, skippedFields: result.skippedFields };
    } catch (e) {
      const code = e instanceof StorageError ? e.code : e instanceof DOMException && e.name === "QuotaExceededError" ? "quota" : "storage";
      return { ok: false, error: code === "not-enabled" ? "revoked" : code };
    }
  }

  if (msg.type === "searchIncluded") {
    const fKey = await computeFormKey(h, msg.form);
    const { fieldKey } = await fieldIdentity(h, fKey, msg.descriptor);
    const rules = await store.listFieldRules(d, ctx.origin);
    return { ok: true, included: rules.some((r) => r.mode === "include-search" && r.fieldKey === fieldKey) && !rules.some((r) => r.mode === "exclude" && r.fieldKey === fieldKey) };
  }

  // submitted
  await store.markSubmitted(d, {
    origin: ctx.origin,
    documentSessionId: cap!.documentSessionId,
    routeHash: await computeRouteHash(h, msg.url),
    formKey: await computeFormKey(h, msg.form),
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Extension UI
// ---------------------------------------------------------------------------

async function tabContext(tabId: number) {
  const tab = await ext.tabs.get(tabId).catch(() => null);
  if (!tab || tab.incognito || !isSupportedUrl(tab.url)) return null;
  return { tab, url: tab.url, origin: new URL(tab.url).origin };
}

function capForTab(tabId: number): [string, Capability] | undefined {
  return [...capabilities].find(([, c]) => c.tabId === tabId);
}

interface DescribeReply {
  ok: boolean;
  fields?: PageField[];
}

function hostnameOf(origin: string): string {
  const u = new URL(origin);
  return u.port ? `${u.hostname}:${u.port}` : u.hostname;
}

function pruneMemory(): void {
  const cutoff = now() - PLAN_TTL_MS;
  for (const [k, p] of plans) if (p.createdAt < cutoff) plans.delete(k);
  if (fieldSessions.size > 20) fieldSessions.clear();
}

async function handleUi(msg: UiMessage): Promise<unknown> {
  const d = await db();
  const t = now();
  switch (msg.type) {
    case "popupState": {
      const meta = await store.getMeta(d);
      const c = await tabContext(msg.tabId);
      if (!c) return { ok: true, supported: false, paused: meta.paused };
      const policy = await store.getPolicy(d, c.origin);
      const permission = await ext.permissions.contains({ origins: [originPattern(c.origin)] });
      const status = await toContent<{ state: string; savedAt: number | null; error: string | null; documentSessionId: string; warning: string | null }>(msg.tabId, { type: "status" });
      const candidates =
        policy?.enabled && permission
          ? await store.candidateDrafts(d, c.origin, await computeRouteHash(await hasher(), c.url), status?.documentSessionId ?? null, t)
          : [];
      return {
        ok: true,
        supported: true,
        origin: c.origin,
        hostname: hostnameOf(c.origin),
        enabled: !!policy?.enabled,
        permission,
        paused: meta.paused,
        status: status ? { state: status.state, savedAt: status.savedAt, error: status.error, warning: status.warning } : null,
        candidateCount: candidates.length,
      };
    }
    case "enableSite": {
      const c = await tabContext(msg.tabId);
      if (!c) return { ok: false, error: "unsupported" };
      if (!(await ext.permissions.contains({ origins: [originPattern(c.origin)] }))) return { ok: false, error: "permission-denied" };
      await store.enableSite(d, c.origin, t);
      await registerFor(c.origin);
      await ext.scripting.executeScript({ target: { tabId: msg.tabId, frameIds: [0] }, files: ["content.js"] }).catch(() => undefined);
      // An already-injected script re-handshakes on invalidate.
      await toContent(msg.tabId, { type: "invalidate" });
      return { ok: true };
    }
    case "disableSite": {
      const origin = new URL(msg.origin).origin;
      // Persist intent first so the permission-removed event keeps drafts only for this deliberate action.
      await store.disableSite(d, origin, !msg.keepDrafts, t);
      if (msg.keepDrafts) await store.setKeepDraftsIntent(d, origin, true);
      await broadcast((c) => c.origin === origin, { type: "stop" });
      await unregisterFor(origin);
      const others = (await store.listPolicies(d)).some((p) => p.enabled && originPattern(p.origin) === originPattern(origin));
      if (!others) await ext.permissions.remove({ origins: [originPattern(origin)] }).catch(() => undefined);
      return { ok: true };
    }
    case "setPaused": {
      await store.setPaused(d, msg.paused);
      await broadcast(() => true, { type: msg.paused ? "stop" : "invalidate" });
      if (!msg.paused) await resumeTabs();
      return { ok: true };
    }
    case "getSettings": {
      const meta = await store.getMeta(d);
      const sites = await Promise.all(
        (await store.listPolicies(d))
          .filter((p) => p.enabled)
          .map(async (p) => ({ origin: p.origin, hostname: hostnameOf(p.origin), permission: await ext.permissions.contains({ origins: [originPattern(p.origin)] }) })),
      );
      return { ok: true, retentionDays: meta.retentionDays, paused: meta.paused, sites, stats: await store.stats(d, t), dbError };
    }
    case "setRetention":
      return { ok: true, pruned: await store.setRetention(d, msg.days, t) };
    case "listDrafts": {
      const drafts = await store.listDrafts(d, t);
      const { retentionDays } = await store.getMeta(d);
      const formLetters = new Map<string, string>();
      const drafted = await Promise.all(drafts.map((dr) => store.getDraft(d, dr.id, t)));
      return {
        ok: true,
        drafts: drafted.flatMap((x) => {
          if (!x) return [];
          const k = `${x.draft.origin}|${x.draft.formKey}`;
          if (!formLetters.has(k)) formLetters.set(k, String.fromCharCode(65 + ([...formLetters.keys()].filter((f) => f.startsWith(x.draft.origin + "|")).length % 26)));
          return [
            {
              id: x.draft.id,
              origin: x.draft.origin,
              hostname: hostnameOf(x.draft.origin),
              formLabel: formLetters.get(k)!,
              updatedAt: x.draft.updatedAt,
              expiresAt: Math.min(x.draft.expiresAt, expiryFor(x.draft.updatedAt, retentionDays)),
              fieldCount: x.revision.fields.length,
              status: x.draft.status,
            },
          ];
        }),
      };
    }
    case "getDraft": {
      const x = await store.getDraft(d, msg.draftId, t);
      if (!x) return { ok: false, error: "not-found" };
      return {
        ok: true,
        fields: x.revision.fields.map((f) => ({ fieldKey: f.fieldKey, kind: f.kind, label: f.genericLabel, ordinal: f.identity.ordinal, value: f.value, editedAt: f.editedAt })),
      };
    }
    case "deleteDraft": {
      const x = await store.getDraft(d, msg.draftId, t);
      const ok = await store.deleteDraft(d, msg.draftId);
      if (x) await refreshBadges(x.draft.origin);
      return { ok };
    }
    case "deleteSite": {
      const origin = new URL(msg.origin).origin;
      const removed = await store.deleteSiteDrafts(d, origin);
      await broadcast((c) => c.origin === origin, { type: "invalidate" });
      await refreshBadges(origin);
      return { ok: true, removed };
    }
    case "deleteAll": {
      await store.deleteAllDrafts(d);
      await broadcast(() => true, { type: "invalidate" });
      const remaining = (await store.listDrafts(d, t)).length;
      return { ok: remaining === 0, remaining };
    }
    case "recoveryCandidates": {
      const c = await tabContext(msg.tabId);
      if (!c) return { ok: false, error: "unsupported" };
      const policy = await store.getPolicy(d, c.origin);
      if (!policy?.enabled) return { ok: false, error: "not-enabled" };
      const own = capForTab(msg.tabId)?.[1].documentSessionId ?? null;
      const route = await computeRouteHash(await hasher(), c.url);
      const drafts = await store.candidateDrafts(d, c.origin, route, own, t);
      const sameOriginOther = (await store.listDrafts(d, t)).filter((x) => x.origin === c.origin && x.routeHash !== route).length;
      const full = await Promise.all(drafts.map((x) => store.getDraft(d, x.id, t)));
      return {
        ok: true,
        hostname: hostnameOf(c.origin),
        liveScript: !!capForTab(msg.tabId),
        sameOriginOther,
        candidates: full.flatMap((x) =>
          x ? [{ id: x.draft.id, updatedAt: x.draft.updatedAt, status: x.draft.status, fieldKinds: x.revision.fields.map((f) => f.kind), fieldCount: x.revision.fields.length }] : [],
        ),
      };
    }
    case "planRestore": {
      pruneMemory();
      const c = await tabContext(msg.tabId);
      if (!c) return { ok: false, error: "unsupported" };
      const live = capForTab(msg.tabId);
      if (!live) return { ok: false, error: "no-script" };
      const x = await store.getDraft(d, msg.draftId, t);
      const h = await hasher();
      const route = await computeRouteHash(h, c.url);
      if (!x || x.draft.origin !== c.origin) return { ok: false, error: "not-found" };
      if (x.draft.routeHash !== route) return { ok: false, error: "route-mismatch" };
      const epoch = await store.epochFor(d, c.origin);
      if (!epoch) return { ok: false, error: "not-enabled" };
      const described = await toContent<DescribeReply>(msg.tabId, { type: "describe", capability: live[0] });
      if (!described?.ok || !described.fields) return { ok: false, error: "no-script" };
      const current = await Promise.all(
        described.fields.map(async (f) => {
          const fKey = await computeFormKey(h, f.form);
          const { identity } = await fieldIdentity(h, fKey, f.descriptor);
          return { ref: f.ref, kind: f.descriptor.kind, identity, formKey: fKey, field: f };
        }),
      );
      const matches = matchFields(
        x.revision.fields.map((f) => ({ fieldKey: f.fieldKey, kind: f.kind, identity: f.identity })),
        current.filter((c2) => !c2.field.search),
        x.draft.formKey,
      );
      const items: PlanItem[] = x.revision.fields.map((f, i) => {
        const m = matches[i]!;
        const target = m.status === "direct" ? current.find((c2) => c2.ref === m.ref)?.field : undefined;
        const item: PlanItem = { fieldKey: f.fieldKey, kind: f.kind, label: f.genericLabel, saved: f.value, status: m.status };
        if (m.status === "manual") item.reason = m.reason;
        if (target) {
          item.ref = target.ref;
          item.current = target.current;
          item.currentLabel = target.displayLabel;
          item.fingerprint = target.fingerprint;
        }
        return item;
      });
      const plan: Plan = { planId: newId(), tabId: msg.tabId, capability: live[0], origin: c.origin, routeHash: route, draftId: x.draft.id, epoch, items, createdAt: t };
      plans.set(plan.planId, plan);
      return { ok: true, planId: plan.planId, savedAt: x.draft.updatedAt, status: x.draft.status, items };
    }
    case "restore": {
      const plan = plans.get(msg.planId);
      if (!plan) return { ok: false, error: "stale-plan" };
      // Revalidate everything immediately before delivery.
      const c = await tabContext(plan.tabId);
      const h = await hasher();
      if (!c || c.origin !== plan.origin || (await computeRouteHash(h, c.url)) !== plan.routeHash) return { ok: false, error: "navigated" };
      if (!capabilities.has(plan.capability) || capabilities.get(plan.capability)!.tabId !== plan.tabId) return { ok: false, error: "stale-plan" };
      if (!(await ext.permissions.contains({ origins: [originPattern(plan.origin)] }))) return { ok: false, error: "not-enabled" };
      const epoch = await store.epochFor(d, plan.origin);
      if (!epoch || epoch.global !== plan.epoch.global || epoch.site !== plan.epoch.site) return { ok: false, error: "stale-plan" };
      if (!(await store.getDraft(d, plan.draftId, t))) return { ok: false, error: "not-found" };
      const byKey = new Map(plan.items.map((i) => [i.fieldKey, i]));
      const outcomes: { fieldKey: string; outcome: ApplyOutcome }[] = [];
      const deliver: { ref: number; value: FieldValue; expectedFingerprint: string; fieldKey: string }[] = [];
      for (const s of msg.selections) {
        const item = byKey.get(s.fieldKey);
        if (!item || item.status !== "direct" || item.ref === undefined || !item.fingerprint) {
          outcomes.push({ fieldKey: s.fieldKey, outcome: "unsupported" });
          continue;
        }
        const populated = item.current ? !isEmptyValue(item.current) : false;
        if (populated && !s.replace) {
          outcomes.push({ fieldKey: s.fieldKey, outcome: "skipped" });
          continue;
        }
        deliver.push({ ref: item.ref, value: item.saved, expectedFingerprint: item.fingerprint, fieldKey: s.fieldKey });
      }
      plan.restoreId = newId();
      if (deliver.length > 0) {
        const reply = await toContent<{ ok: boolean; results?: { ref: number; outcome: ApplyOutcome }[] }>(plan.tabId, {
          type: "apply",
          capability: plan.capability,
          restoreId: plan.restoreId,
          items: deliver.map(({ ref, value, expectedFingerprint }) => ({ ref, value, expectedFingerprint })),
        });
        for (const dl of deliver) {
          const r = reply?.results?.find((x) => x.ref === dl.ref);
          outcomes.push({ fieldKey: dl.fieldKey, outcome: r?.outcome ?? "failed" });
        }
      }
      return { ok: true, outcomes };
    }
    case "undoRestore": {
      const plan = plans.get(msg.planId);
      if (!plan?.restoreId) return { ok: false, error: "stale-plan" };
      const reply = await toContent<{ ok: boolean; reverted: number; kept: number }>(plan.tabId, { type: "undo", capability: plan.capability, restoreId: plan.restoreId });
      return reply ?? { ok: false, error: "stale-plan" };
    }
    case "pageFields": {
      const c = await tabContext(msg.tabId);
      const live = capForTab(msg.tabId);
      if (!c || !live) return { ok: false, error: "no-script" };
      const described = await toContent<DescribeReply>(msg.tabId, { type: "describe", capability: live[0] });
      if (!described?.fields) return { ok: false, error: "no-script" };
      const h = await hasher();
      const rules = await store.listFieldRules(d, c.origin);
      const session: FieldSession = { planId: newId(), tabId: msg.tabId, origin: c.origin, fields: new Map() };
      const fields = await Promise.all(
        described.fields.map(async (f) => {
          const { fieldKey } = await fieldIdentity(h, await computeFormKey(h, f.form), f.descriptor);
          session.fields.set(f.ref, { fieldKey });
          return {
            ref: f.ref,
            kind: f.descriptor.kind,
            label: f.displayLabel || genericLabel(f.descriptor.kind, f.descriptor.ordinal),
            search: f.search,
            excluded: rules.some((r) => r.mode === "exclude" && r.fieldKey === fieldKey),
            included: rules.some((r) => r.mode === "include-search" && r.fieldKey === fieldKey),
          };
        }),
      );
      fieldSessions.set(session.planId, session);
      return { ok: true, planId: session.planId, fields };
    }
    case "setFieldRule": {
      const s = fieldSessions.get(msg.planId);
      const f = s?.fields.get(msg.ref);
      if (!s || !f) return { ok: false, error: "stale-plan" };
      await store.addFieldRule(d, s.origin, f.fieldKey, msg.mode, t);
      await broadcast((c) => c.origin === s.origin, { type: "invalidate" });
      return { ok: true };
    }
    case "diagnostics": {
      const meta = await store.getMeta(d);
      const st = await store.stats(d, t);
      const ua = navigator.userAgent.match(/(Firefox|Edg|Chrome)\/(\d+)/);
      const family = ua ? (ua[1] === "Edg" ? "Edge" : ua[1]) : "unknown";
      return {
        ok: true,
        text: [
          `Form Rescue ${ext.runtime.getManifest().version}`,
          `Browser: ${family} ${ua?.[2] ?? "?"}`,
          `Schema version: ${store.DB_VERSION}`,
          `Capture paused: ${meta.paused ? "yes" : "no"}`,
          `Retention: ${meta.retentionDays} days`,
          `Enabled sites: ${st.sites}`,
          `Drafts: ${st.drafts}`,
          `Stored draft data: ${Math.round(st.bytes / 1024)} KiB of ${LIMITS.totalBytes / 1024 / 1024} MiB budget`,
          `Storage error: ${dbError ?? "none"}`,
        ].join("\n"),
      };
    }
  }
}

function isEmptyValue(v: FieldValue): boolean {
  switch (v.kind) {
    case "text":
      return v.text === "";
    case "select":
      return v.values.every((x) => x === "");
    case "checkbox":
      return !v.checked;
    case "radio":
      return v.selectedOptionKey === null;
  }
}

async function refreshBadges(origin: string): Promise<void> {
  const d = await db();
  const h = await hasher();
  for (const c of capabilities.values()) {
    if (c.origin !== origin) continue;
    const ctx = await tabContext(c.tabId);
    if (!ctx) continue;
    const n = await store.candidateDrafts(d, origin, await computeRouteHash(h, ctx.url), c.documentSessionId, now());
    await setBadge(c.tabId, n.length);
  }
}

/** After un-pausing, live scripts were stopped; ask them to handshake again. */
async function resumeTabs(): Promise<void> {
  const d = await db();
  for (const p of await store.listPolicies(d)) {
    if (!p.enabled) continue;
    const tabs = await ext.tabs.query({ url: originPattern(p.origin) }).catch(() => []);
    await Promise.all(tabs.map((tab) => (tab.id !== undefined ? toContent(tab.id, { type: "invalidate" }) : null)));
  }
}

// ---------------------------------------------------------------------------
// Listeners: registered synchronously at startup (MV3 requirement).
// ---------------------------------------------------------------------------

const runtimeId = ext.runtime.id;
const extensionOrigin = ext.runtime.getURL("");

ext.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  const ctx = classifySender(sender, runtimeId, extensionOrigin);
  let work: Promise<unknown>;
  if (ctx.kind === "content") {
    const parsed = parseMessage(contentMessageSchema, raw);
    if (!parsed.ok) work = Promise.resolve({ ok: false, error: parsed.error });
    else if (!limiter.allow(`tab:${ctx.tabId}`, now())) work = Promise.resolve({ ok: false, error: "rate-limited" });
    else work = handleContent(parsed.data, ctx);
  } else if (ctx.kind === "ui") {
    const parsed = parseMessage(uiMessageSchema, raw);
    work = parsed.ok ? handleUi(parsed.data) : Promise.resolve({ ok: false, error: parsed.error });
  } else {
    work = Promise.resolve({ ok: false, error: "unauthorized" });
  }
  work.then(sendResponse, (e: unknown) => sendResponse({ ok: false, error: e instanceof StorageError ? e.code : "internal" }));
  return true;
});

ext.runtime.onInstalled.addListener((details) => {
  void reconcile();
  void ext.alarms.create("prune", { periodInMinutes: 60 });
  if (details.reason === "install") void ext.tabs.create({ url: ext.runtime.getURL("pages/onboarding/index.html") });
});

ext.runtime.onStartup.addListener(() => {
  void reconcile();
  void ext.alarms.create("prune", { periodInMinutes: 60 });
});

ext.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "prune") void db().then((d) => store.pruneExpired(d, now()));
});

ext.permissions.onRemoved.addListener((removed) => {
  void (async () => {
    const d = await db();
    const patterns = new Set(removed.origins ?? []);
    for (const p of await store.listPolicies(d)) {
      if (!patterns.has(originPattern(p.origin))) continue;
      // Deliberate "disable and keep drafts" recorded intent first; anything else fails closed.
      const keep = p.keepDraftsOnRemoval;
      await store.disableSite(d, p.origin, !keep, now());
      await broadcast((c) => c.origin === p.origin, { type: "stop" });
      await ext.scripting.unregisterContentScripts({ ids: [scriptId(p.origin)] }).catch(() => undefined);
    }
  })();
});

ext.tabs.onRemoved.addListener((tabId) => {
  for (const [key, c] of capabilities) if (c.tabId === tabId) capabilities.delete(key);
});

// Firefox event pages do not always fire onStartup for temporary installs; reconcile opportunistically.
if (isFirefox()) void reconcile().catch(() => undefined);
