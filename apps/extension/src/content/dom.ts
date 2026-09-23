/**
 * DOM helpers for the content script. Everything that decides eligibility
 * reads attributes and label text only; values are read exclusively through
 * readValue(), which callers invoke after classifyField() says eligible.
 */
import {
  classifyField,
  hasSensitiveTerms,
  isFormPoisoningControl,
  LIMITS,
  META_LIMIT,
  type Eligibility,
  type FieldDescriptor,
  type FieldMeta,
  type FieldValue,
  type FormDescriptor,
} from "@form-rescue/core";

export type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
export type Container = HTMLFormElement | Element;

const CONTROL_SELECTOR = "input, textarea, select";
const VIRTUAL_CONTAINER = "fieldset, [role=form], [role=group], [role=dialog], dialog, section, article, main";
/** Bound per-container scans so hostile pages cannot make capture expensive. */
const MAX_SCAN = 500;

export function isControl(el: unknown): el is Control {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

function bounded(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, META_LIMIT);
}

/** closest() that crosses open shadow-root boundaries. */
export function composedClosest(el: Element, selector: string): Element | null {
  let node: Element | null = el;
  while (node) {
    const hit = node.closest(selector);
    if (hit) return hit;
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? root.host : null;
  }
  return null;
}

function labelText(el: Control): string {
  const parts: string[] = [];
  el.labels?.forEach((l) => parts.push(l.textContent ?? ""));
  const ids = el.getAttribute("aria-labelledby");
  if (ids) {
    const root = el.getRootNode() as Document | ShadowRoot;
    for (const id of ids.split(/\s+/).slice(0, 5)) parts.push(root.getElementById?.(id)?.textContent ?? "");
  }
  return bounded(parts.join(" "));
}

function groupLabel(el: Control): string {
  const fs = el.closest("fieldset");
  const legend = fs?.querySelector(":scope > legend")?.textContent;
  const labelled = el.closest("[role=group][aria-label], [role=radiogroup][aria-label]")?.getAttribute("aria-label");
  return bounded(legend ?? labelled ?? "");
}

function isVisible(el: Element): boolean {
  const withCheck = el as Element & { checkVisibility?: (o?: object) => boolean };
  if (typeof withCheck.checkVisibility === "function") return withCheck.checkVisibility({ visibilityProperty: true });
  return el.getClientRects().length > 0;
}

/**
 * Metadata for classification. `light` is for whole-form sensitivity scans: it skips
 * visibility/ancestor/state checks and label lookups, which the scan does per container.
 */
export function buildMeta(el: Control, light = false): FieldMeta {
  const tag = el instanceof HTMLTextAreaElement ? "textarea" : el instanceof HTMLSelectElement ? "select" : "input";
  const form = el.form;
  return {
    tag,
    // HTMLInputElement.type already maps missing/unknown types to "text".
    type: tag === "input" ? (el as HTMLInputElement).type.toLowerCase() : tag,
    autocomplete: bounded(el.getAttribute("autocomplete")).toLowerCase(),
    formAutocompleteOff: (form?.getAttribute("autocomplete") ?? "").trim().toLowerCase() === "off",
    optOut: !light && composedClosest(el, '[data-form-rescue="off" i]') !== null,
    disabled: !light && el.matches(":disabled"),
    readOnly: !light && tag !== "select" && (el as HTMLInputElement).readOnly,
    inert: !light && composedClosest(el, "[inert]") !== null,
    visible: light || isVisible(el),
    multiple: tag === "select" ? (el as HTMLSelectElement).multiple : false,
    id: bounded(el.id),
    name: bounded(el.getAttribute("name")),
    labelText: light ? "" : labelText(el),
    ariaLabel: bounded(el.getAttribute("aria-label")),
    placeholder: bounded(el.getAttribute("placeholder")),
    groupLabel: light ? "" : groupLabel(el),
  };
}

/** The form, or a conservative virtual container (nearest semantic region, else the control alone). */
export function containerOf(el: Control): Container {
  return el.form ?? el.closest(VIRTUAL_CONTAINER) ?? el;
}

function controlsIn(container: Container): Control[] {
  if (isControl(container)) return [container];
  const list = container instanceof HTMLFormElement ? Array.from(container.elements) : Array.from(container.querySelectorAll(CONTROL_SELECTOR));
  return list.filter(isControl).slice(0, MAX_SCAN);
}

let poisonCache = new WeakMap<Container, boolean>();
/** Mutations can change sensitivity. Form descriptors stay fixed for the document so draft identity is stable. */
export function resetCaches(): void {
  poisonCache = new WeakMap();
}

/** A form with password/OTP/payment/identity-secret indicators is excluded as a whole. */
export function isSensitiveContainer(container: Container): boolean {
  let hit = poisonCache.get(container);
  if (hit === undefined) {
    // Label and group text is checked once per container: per-control label lookups are O(n²) on big forms.
    const groups = isControl(container) ? [] : Array.from(container.querySelectorAll("label, legend, [role=group][aria-label], [role=radiogroup][aria-label]")).slice(0, MAX_SCAN);
    hit =
      hasSensitiveTerms(groups.map((g) => bounded(g.getAttribute("aria-label") ?? g.textContent)), { includeContact: false }) ||
      controlsIn(container).some((c) => isFormPoisoningControl(buildMeta(c, true)));
    poisonCache.set(container, hit);
  }
  return hit;
}

export function eligibility(el: Control): Eligibility {
  return classifyField(buildMeta(el), { sensitiveForm: isSensitiveContainer(containerOf(el)) });
}

/** For radio buttons the field is the whole named group within its container. */
export function radioGroup(el: HTMLInputElement): HTMLInputElement[] {
  if (!el.name) return [el];
  const scope = el.form ?? (el.getRootNode() as Document | ShadowRoot);
  const all = scope instanceof HTMLFormElement ? Array.from(scope.elements) : Array.from(scope.querySelectorAll(`input[type=radio]`));
  return all.filter((r): r is HTMLInputElement => r instanceof HTMLInputElement && r.type === "radio" && r.name === el.name).slice(0, MAX_SCAN);
}

/** Option key for checkbox/radio from the value attribute (metadata), never the value getter. */
export function optionKey(el: HTMLInputElement): string {
  return el.getAttribute("value") ?? "on";
}

/** Canonical element representing a field (first radio of a group). */
export function fieldAnchor(el: Control): Control {
  return el instanceof HTMLInputElement && el.type === "radio" ? (radioGroup(el)[0] ?? el) : el;
}

function signatureOf(container: Container): string {
  return controlsIn(container)
    .map((c) => `${c.tagName.toLowerCase()}:${c instanceof HTMLInputElement ? c.type : ""}:${c.getAttribute("name") ?? ""}`)
    .join(",")
    .slice(0, LIMITS.optionsSignature);
}

const descriptorCache = new WeakMap<Container, FormDescriptor>();
export function formDescriptor(container: Container): FormDescriptor {
  const cached = descriptorCache.get(container);
  if (cached) return cached;
  let d: FormDescriptor;
  if (container instanceof HTMLFormElement) {
    let action = "";
    const raw = container.getAttribute("action");
    if (raw) {
      try {
        const u = new URL(raw, location.href);
        if (u.origin === location.origin) action = u.pathname.slice(0, META_LIMIT);
      } catch {
        /* ignore */
      }
    }
    d = {
      virtual: false,
      id: bounded(container.id),
      name: bounded(container.getAttribute("name")),
      action,
      signature: signatureOf(container),
      ordinal: Math.max(0, Array.from(document.forms).indexOf(container)),
    };
  } else {
    const tag = container.tagName.toLowerCase();
    d = {
      virtual: true,
      id: bounded(container.id),
      name: bounded(container.getAttribute("aria-label") ?? ""),
      action: "",
      signature: signatureOf(container),
      ordinal: Math.max(0, Array.from((container.getRootNode() as Document | ShadowRoot).querySelectorAll(tag)).indexOf(container)),
    };
  }
  descriptorCache.set(container, d);
  return d;
}

/** Ordinal among supported controls of the container (radio groups count once). */
function ordinalOf(anchor: Control, container: Container): number {
  const seen = new Set<string>();
  let i = 0;
  for (const c of controlsIn(container)) {
    if (c instanceof HTMLInputElement && c.type === "radio") {
      const key = `r:${c.name}`;
      if (c.name && seen.has(key)) continue;
      seen.add(key);
    }
    if (c === anchor) return i;
    i++;
  }
  return i;
}

/** Distinguishes controls that share tag/type/id/name within a container, so they never collide. */
function occurrenceOf(anchor: Control, container: Container): number {
  const sig = (c: Control) => `${c.tagName}|${c instanceof HTMLInputElement ? c.type : ""}|${c.id}|${c.getAttribute("name") ?? ""}`;
  const mine = sig(anchor);
  const same = controlsIn(container).filter((c) => sig(c) === mine && fieldAnchor(c) === c);
  return Math.max(0, same.indexOf(anchor));
}

export function fieldDescriptor(el: Control, kind: FieldDescriptor["kind"]): FieldDescriptor {
  const anchor = fieldAnchor(el);
  const container = containerOf(anchor);
  let options = "";
  if (el instanceof HTMLSelectElement) options = Array.from(el.options, (o) => o.value).join("\u0001");
  else if (el instanceof HTMLInputElement && el.type === "radio") options = radioGroup(el).map(optionKey).join("\u0001");
  else if (el instanceof HTMLInputElement && el.type === "checkbox") options = optionKey(el);
  const isRadio = el instanceof HTMLInputElement && el.type === "radio";
  return {
    kind,
    id: isRadio ? "" : bounded(el.id),
    name: bounded(el.getAttribute("name")),
    label: isRadio ? groupLabel(el) : labelText(el) || bounded(el.getAttribute("aria-label")),
    group: groupLabel(el),
    options: options.slice(0, LIMITS.optionsSignature),
    ordinal: ordinalOf(anchor, container),
    occurrence: occurrenceOf(anchor, container),
  };
}

/** Reads a value. Call only after eligibility() returned eligible for this control. */
export function readValue(el: Control, kind: FieldDescriptor["kind"]): FieldValue {
  if (kind === "text") return { kind, text: (el as HTMLInputElement | HTMLTextAreaElement).value };
  if (kind === "select") return { kind, values: Array.from((el as HTMLSelectElement).selectedOptions, (o) => o.value).slice(0, LIMITS.selectValues) };
  if (kind === "checkbox") return { kind, checked: (el as HTMLInputElement).checked };
  const checked = radioGroup(el as HTMLInputElement).find((r) => r.checked);
  return { kind: "radio", selectedOptionKey: checked ? optionKey(checked) : null };
}

/** Non-cryptographic change-detection fingerprint (cyrb53); works on http pages without crypto.subtle. */
export function fingerprint(v: FieldValue): string {
  const str = JSON.stringify(v);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** All controls in the document and discoverable open shadow roots, bounded. */
export function allControls(root: Document | ShadowRoot = document, budget = { n: 5000 }): Control[] {
  const out: Control[] = [];
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (--budget.n < 0) break;
    if (isControl(el)) out.push(el);
    if (el.shadowRoot) out.push(...allControls(el.shadowRoot, budget));
  }
  return out;
}

/** Set a value the way a user edit would, so framework-controlled inputs observe it. */
export function applyValue(el: Control, v: FieldValue): boolean {
  if (v.kind === "text") {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v.text);
    el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  if (v.kind === "select" && el instanceof HTMLSelectElement) {
    const opts = Array.from(el.options);
    if (!v.values.every((val) => opts.some((o) => o.value === val && !o.disabled))) return false;
    if (el.multiple) opts.forEach((o) => (o.selected = v.values.includes(o.value)));
    else Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, v.values[0] ?? "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  if (v.kind === "checkbox" && el instanceof HTMLInputElement) {
    // Toggling via click() fires the input/change/click events frameworks listen for; it clicks only this checkbox.
    if (el.checked !== v.checked) el.click();
    return true;
  }
  if (v.kind === "radio" && el instanceof HTMLInputElement) {
    const group = radioGroup(el);
    if (v.selectedOptionKey === null) return false;
    const target = group.filter((r) => optionKey(r) === v.selectedOptionKey);
    if (target.length !== 1 || target[0]!.disabled) return false;
    if (!target[0]!.checked) target[0]!.click();
    return true;
  }
  return false;
}
