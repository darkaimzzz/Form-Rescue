import {
  looksSensitiveValue,
  parseMessage,
  toContentMessageSchema,
  utf8Length,
  LIMITS,
  type ApplyOutcome,
  type Epoch,
  type FieldDelta,
  type FieldValue,
  type PageField,
  type SaveErrorCode,
  type SaveState,
  type ToContentMessage,
} from "@form-rescue/core";
import { ext } from "../platform/browser.js";
import {
  allControls,
  applyValue,
  containerOf,
  eligibility,
  fieldAnchor,
  fieldDescriptor,
  fingerprint,
  formDescriptor,
  isControl,
  readValue,
  resetCaches,
  type Container,
  type Control,
} from "./dom.js";

const DEBOUNCE_MS = 300;
const MAX_WAIT_MS = 1000;

declare global {
  // eslint-disable-next-line no-var
  var __formRescueLoaded: boolean | undefined;
}

type Pending = { el: Control; url: string; editedAt: number };
type CommitReply = { ok: boolean; error?: string; savedAt?: number | null; skippedFields?: number };

function main(): void {
  // Top-level HTTP(S) documents only; frames and other schemes are never captured.
  if (window.top !== window || !/^https?:$/.test(location.protocol)) return;

  const documentSessionId = crypto.randomUUID();
  let capability: string | null = null;
  let epoch: Epoch | null = null;
  let active = false;
  let listening = false;
  let state: SaveState = "idle";
  let savedAt: number | null = null;
  let errorCode: SaveErrorCode | null = null;
  let warning: "too-large" | "fields-skipped" | null = null;
  let sequence = 0;
  let pending = new Map<Control, Pending>();
  let firstPendingAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let handshaking: Promise<boolean> | null = null;
  const touched = new Set<Control>();
  const searchCache = new Map<Control, boolean>();
  let refs = new Map<number, Control>();
  const undo = new Map<string, { el: Control; before: FieldValue; restored: FieldValue }[]>();

  async function send<T>(msg: unknown): Promise<T | null> {
    try {
      return (await ext.runtime.sendMessage(msg)) as T;
    } catch {
      return null;
    }
  }

  function handshake(): Promise<boolean> {
    handshaking ??= (async () => {
      const r = await send<{ ok: boolean; capability?: string; epoch?: Epoch; error?: string }>({
        type: "handshake",
        documentSessionId,
        url: location.href,
      });
      handshaking = null;
      if (r?.ok && r.capability && r.epoch) {
        capability = r.capability;
        epoch = r.epoch;
        active = true;
        if (state === "idle" || state === "paused") state = "ready";
        attach();
        return true;
      }
      active = false;
      capability = null;
      state = r?.error === "paused" ? "paused" : "idle";
      return false;
    })();
    return handshaking;
  }

  function clearBuffers(): void {
    pending = new Map();
    clearTimeout(timer);
    timer = undefined;
    searchCache.clear();
  }

  function schedule(): void {
    const t = Date.now();
    if (!firstPendingAt) firstPendingAt = t;
    clearTimeout(timer);
    const wait = Math.max(0, Math.min(DEBOUNCE_MS, firstPendingAt + MAX_WAIT_MS - t));
    timer = setTimeout(() => void flush(), wait);
  }

  async function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    firstPendingAt = 0;
    if (!active || !capability || !epoch || pending.size === 0) return;
    const batch = pending;
    pending = new Map();

    // Group by (route, container); revalidate and read values only now.
    const groups = new Map<string, { url: string; container: Container; fields: FieldDelta[] }>();
    const containerIds = new Map<Container, number>();
    for (const { el, url, editedAt } of batch.values()) {
      if (!el.isConnected) continue;
      const container = containerOf(el);
      if (!containerIds.has(container)) containerIds.set(container, containerIds.size);
      const key = `${url}#${containerIds.get(container)}`;
      const g = groups.get(key) ?? { url, container, fields: [] };
      groups.set(key, g);
      const e = eligibility(el);
      if (!e.eligible) {
        // Became sensitive/excluded after it was edited: purge saved values.
        g.fields.push({ descriptor: fieldDescriptor(el, kindOfControl(el)), value: null, editedAt });
        continue;
      }
      const value = readValue(el, e.kind);
      if (value.kind === "text" && utf8Length(value.text) > LIMITS.textBytes) {
        warning = "too-large";
        continue;
      }
      if (value.kind === "text" && looksSensitiveValue(value.text)) {
        g.fields.push({ descriptor: fieldDescriptor(el, e.kind), value: null, editedAt });
        continue;
      }
      g.fields.push({ descriptor: fieldDescriptor(el, e.kind), value, editedAt });
    }

    for (const g of groups.values()) {
      if (g.fields.length === 0) continue;
      const msg = {
        type: "commit",
        capability,
        requestId: crypto.randomUUID(),
        sequence: ++sequence,
        epoch,
        url: g.url,
        form: formDescriptor(g.container),
        fields: g.fields.slice(0, LIMITS.fieldsPerDraft),
      };
      state = "saving";
      const c0 = __FR_E2E__ ? performance.now() : 0;
      let reply = await send<CommitReply>(msg);
      if (__FR_E2E__) performance.measure("fr-commit", { start: c0, end: performance.now() });
      if (reply?.error === "stale-capability" && (await handshake())) {
        // Background restarted: same request ID and sequence, fresh capability.
        reply = await send<CommitReply>({ ...msg, capability });
      }
      if (reply?.ok) {
        state = "saved";
        errorCode = null;
        if (reply.savedAt) savedAt = reply.savedAt;
        if (reply.skippedFields) warning = "fields-skipped";
      } else if (reply?.error === "stale" || reply?.error === "paused" || reply?.error === "revoked") {
        // Data was deleted, capture paused, or access revoked: buffered edits must never reappear.
        clearBuffers();
        state = reply.error === "paused" ? "paused" : "error";
        errorCode = reply.error === "revoked" ? "revoked" : reply.error === "stale" ? "stale" : null;
        if (reply.error === "stale") void handshake();
        return;
      } else {
        state = "error";
        errorCode = (reply?.error as SaveErrorCode | undefined) ?? "storage";
      }
    }
  }

  function kindOfControl(el: Control): FieldDelta["descriptor"]["kind"] {
    if (el instanceof HTMLSelectElement) return "select";
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) return el.type;
    return "text";
  }

  async function searchIncluded(el: Control): Promise<boolean> {
    const cached = searchCache.get(el);
    if (cached !== undefined) return cached;
    const r = await send<{ ok: boolean; included?: boolean }>({
      type: "searchIncluded",
      capability,
      url: location.href,
      form: formDescriptor(containerOf(el)),
      descriptor: fieldDescriptor(el, "text"),
    });
    const included = !!r?.included;
    searchCache.set(el, included);
    return included;
  }

  async function onEdit(e: Event): Promise<void> {
    // Only genuine user edits; our own restore events are untrusted and ignored.
    if (!active || !e.isTrusted) return;
    const t0 = __FR_E2E__ ? performance.now() : 0;
    try {
      await handleEdit(e);
    } finally {
      if (__FR_E2E__) performance.measure("fr-handler", { start: t0, end: performance.now() });
    }
  }

  async function handleEdit(e: Event): Promise<void> {
    if ((e as InputEvent).isComposing) return;
    const target = e.composedPath()[0];
    if (!isControl(target)) return;
    const el = target;
    const elig = eligibility(el);
    if (!elig.eligible) {
      if (touched.has(el)) queue(el); // flush will purge
      return;
    }
    if (elig.search && !(await searchIncluded(el))) return;
    queue(el);
  }

  function queue(el: Control): void {
    const key = el instanceof HTMLInputElement && el.type === "radio" ? fieldAnchor(el) : el;
    touched.add(key);
    pending.set(key, { el, url: location.href, editedAt: Date.now() });
    schedule();
  }

  function attach(): void {
    if (listening) return;
    listening = true;
    const opts = { capture: true };
    document.addEventListener("input", (e) => void onEdit(e), opts);
    document.addEventListener("change", (e) => {
      void onEdit(e).then(() => flush());
    }, opts);
    document.addEventListener("compositionend", (e) => void onEdit(e), opts);
    document.addEventListener("focusout", () => void flush(), opts);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flush();
    });
    // SPA navigation: flush the old route scope; later edits carry the new URL.
    window.addEventListener("popstate", () => void flush());
    window.addEventListener("hashchange", () => void flush());
    window.addEventListener("pagehide", () => void flush());
    window.addEventListener("pageshow", (e) => {
      if ((e as PageTransitionEvent).persisted) void handshake(); // restored from back/forward cache
    });
    document.addEventListener(
      "submit",
      (e) => {
        const form = e.target;
        if (!(form instanceof HTMLFormElement) || !active) return;
        if (![...touched].some((t) => t.form === form)) return;
        void flush().then(() => send({ type: "submitted", capability, url: location.href, form: formDescriptor(form) }));
      },
      opts,
    );
    // Bounded observation: mutations only reset caches and recheck the few touched fields.
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        resetCaches();
        for (const el of touched) if (el.isConnected && !eligibility(el).eligible) queue(el);
      });
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["type", "autocomplete", "name", "id", "data-form-rescue", "disabled", "readonly", "inert", "aria-label"],
    });
  }

  function describe(): PageField[] {
    refs = new Map();
    const out: PageField[] = [];
    const seen = new Set<Control>();
    for (const c of allControls()) {
      const el = fieldAnchor(c);
      if (seen.has(el)) continue;
      seen.add(el);
      const e = eligibility(el);
      if (!e.eligible) continue;
      const ref = refs.size;
      refs.set(ref, el);
      const current = readValue(el, e.kind);
      const d = fieldDescriptor(el, e.kind);
      out.push({ ref, descriptor: d, form: formDescriptor(containerOf(el)), search: e.search, current, fingerprint: fingerprint(current), displayLabel: d.label });
      if (out.length >= 300) break;
    }
    return out;
  }

  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  async function apply(msg: Extract<ToContentMessage, { type: "apply" }>): Promise<{ ref: number; outcome: ApplyOutcome }[]> {
    const done: { ref: number; el: Control; kind: FieldValue["kind"]; value: FieldValue; before: FieldValue }[] = [];
    const results: { ref: number; outcome: ApplyOutcome }[] = [];
    for (const item of msg.items) {
      const el = refs.get(item.ref);
      if (!el || !el.isConnected) {
        results.push({ ref: item.ref, outcome: "failed" });
        continue;
      }
      const e = eligibility(el);
      if (!e.eligible || e.kind !== item.value.kind) {
        results.push({ ref: item.ref, outcome: "unsupported" });
        continue;
      }
      const before = readValue(el, e.kind);
      if (fingerprint(before) !== item.expectedFingerprint) {
        results.push({ ref: item.ref, outcome: "conflict" }); // changed since review
        continue;
      }
      if (!applyValue(el, item.value)) {
        results.push({ ref: item.ref, outcome: "failed" });
        continue;
      }
      done.push({ ref: item.ref, el, kind: e.kind, value: item.value, before });
    }
    // Verify after the next frame and a short settling interval (framework re-renders).
    await nextFrame();
    await sleep(250);
    const kept: { el: Control; before: FieldValue; restored: FieldValue }[] = [];
    for (const d of done) {
      const ok = fingerprint(readValue(d.el, d.kind)) === fingerprint(d.value);
      results.push({ ref: d.ref, outcome: ok ? "restored" : "failed" });
      if (ok) kept.push({ el: d.el, before: d.before, restored: d.value });
    }
    undo.set(msg.restoreId, kept);
    return results;
  }

  function doUndo(restoreId: string): { reverted: number; kept: number } {
    const entries = undo.get(restoreId) ?? [];
    undo.delete(restoreId);
    let reverted = 0;
    for (const u of entries) {
      // Only revert if untouched since restore; later edits are preserved.
      if (u.el.isConnected && fingerprint(readValue(u.el, u.restored.kind)) === fingerprint(u.restored) && applyValue(u.el, u.before)) reverted++;
    }
    return { reverted, kept: entries.length - reverted };
  }

  ext.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    if (sender.id !== ext.runtime.id) return false;
    const parsed = parseMessage(toContentMessageSchema, raw);
    if (!parsed.ok) return false;
    const msg = parsed.data;
    const authorized = "capability" in msg ? active && msg.capability === capability : true;
    if (!authorized) {
      sendResponse({ ok: false, error: "stale-capability" });
      return false;
    }
    switch (msg.type) {
      case "status":
        sendResponse({ ok: true, state, savedAt, error: errorCode, warning, documentSessionId });
        return false;
      case "stop":
        active = false;
        capability = null;
        clearBuffers();
        touched.clear();
        state = "paused";
        sendResponse({ ok: true });
        return false;
      case "invalidate":
        active = false;
        capability = null;
        clearBuffers();
        void handshake().then(() => sendResponse({ ok: true }));
        return true;
      case "describe":
        sendResponse({ ok: true, fields: describe() });
        return false;
      case "apply":
        void apply(msg).then((results) => sendResponse({ ok: true, results }));
        return true;
      case "undo":
        sendResponse({ ok: true, ...doUndo(msg.restoreId) });
        return false;
    }
  });

  void handshake();
}

if (!globalThis.__formRescueLoaded) {
  globalThis.__formRescueLoaded = true;
  main();
}
