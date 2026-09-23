import { beforeEach, describe, expect, it } from "vitest";
import {
  allControls,
  applyValue,
  containerOf,
  eligibility,
  fieldDescriptor,
  fingerprint,
  formDescriptor,
  readValue,
  resetCaches,
  type Control,
} from "../../apps/extension/src/content/dom.js";

// jsdom has no layout: treat every element as rendered unless it is hidden.
Element.prototype.getClientRects = function (this: Element) {
  return (this as HTMLElement).hidden ? ([] as unknown as DOMRectList) : ([{}] as unknown as DOMRectList);
};

/** Make every read of .value/.checked/.selectedOptions on el throw. */
function trap(el: Element): void {
  for (const prop of ["value", "checked", "selectedOptions"]) {
    Object.defineProperty(el, prop, {
      configurable: true,
      get() {
        throw new Error(`value read on excluded control #${el.id}`);
      },
      set() {
        throw new Error("write");
      },
    });
  }
}

beforeEach(() => {
  document.body.innerHTML = "";
  resetCaches();
});

describe("hard-excluded controls are rejected from metadata alone", () => {
  const cases: [string, string][] = [
    ["password", `<form><input id="x" type="password"></form>`],
    ["hidden", `<form><input id="x" type="hidden"></form>`],
    ["email", `<form><input id="x" type="email"></form>`],
    ["tel", `<form><input id="x" type="tel"></form>`],
    ["number", `<form><input id="x" type="number"></form>`],
    ["date", `<form><input id="x" type="date"></form>`],
    ["file", `<form><input id="x" type="file"></form>`],
    ["cc autocomplete", `<form><input id="x" autocomplete="cc-number"></form>`],
    ["otp label", `<form><label for="x">One-time code</label><input id="x"></form>`],
    ["api key name", `<form><input id="x" name="apiKey"></form>`],
    ["opt-out ancestor", `<div data-form-rescue="off"><form><textarea id="x"></textarea></form></div>`],
    ["form autocomplete off", `<form autocomplete="off"><textarea id="x"></textarea></form>`],
    ["form with a payment legend", `<form><fieldset><legend>Card number</legend><input name="n"></fieldset><textarea id="x"></textarea></form>`],
    ["form with a secret-labelled control", `<form><label>API key <input name="k"></label><textarea id="x"></textarea></form>`],
    ["poisoned form", `<form><input type="password" name="p"><textarea id="x"></textarea></form>`],
    ["disabled", `<form><textarea id="x" disabled></textarea></form>`],
    ["disabled fieldset", `<form><fieldset disabled><textarea id="x"></textarea></fieldset></form>`],
    ["readonly", `<form><textarea id="x" readonly></textarea></form>`],
    ["inert", `<div inert><textarea id="x"></textarea></div>`],
    ["not rendered", `<form><textarea id="x" hidden></textarea></form>`],
    ["consent/payment radio via label", `<form><fieldset><legend>Card number</legend><input id="x" type="radio" name="r" value="a"></fieldset></form>`],
  ];
  it.each(cases)("%s", (_name, html) => {
    document.body.innerHTML = html;
    const el = document.getElementById("x") as Control;
    trap(el);
    let e;
    expect(() => (e = eligibility(el))).not.toThrow();
    expect(e).toMatchObject({ eligible: false });
    // Descriptor building for purges is metadata-only as well.
    expect(() => fieldDescriptor(el, "text")).not.toThrow();
    expect(() => formDescriptor(containerOf(el))).not.toThrow();
  });

  it("describe-style enumeration never reads excluded values", () => {
    document.body.innerHTML = cases.map(([, h], i) => h.replace(/id="x"/, `id="x${i}" class="t"`).replace(/for="x"/, `for="x${i}"`)).join("") + `<form><textarea id="ok" name="ok"></textarea></form>`;
    document.querySelectorAll(".t").forEach(trap);
    const read: string[] = [];
    for (const c of allControls()) {
      const e = eligibility(c);
      if (e.eligible) read.push(JSON.stringify(readValue(c, e.kind)));
    }
    expect(read).toEqual([JSON.stringify({ kind: "text", text: "" })]);
  });
});

describe("eligible controls", () => {
  it("textarea, text, select, checkbox, radio group", () => {
    document.body.innerHTML = `<form id="f">
      <label for="a">Message</label><textarea id="a" name="a">hi</textarea>
      <input id="b" name="b" value="t">
      <select id="c" name="c"><option value="1">1</option><option value="2" selected>2</option></select>
      <input id="d" type="checkbox" name="d" checked>
      <fieldset><legend>Reply</legend><input type="radio" id="e1" name="e" value="x"><input type="radio" id="e2" name="e" value="y" checked></fieldset>
    </form>`;
    const get = (id: string) => document.getElementById(id) as Control;
    expect(readValue(get("a"), "text")).toEqual({ kind: "text", text: "hi" });
    expect(readValue(get("b"), "text")).toEqual({ kind: "text", text: "t" });
    expect(readValue(get("c"), "select")).toEqual({ kind: "select", values: ["2"] });
    expect(readValue(get("d"), "checkbox")).toEqual({ kind: "checkbox", checked: true });
    expect(readValue(get("e1"), "radio")).toEqual({ kind: "radio", selectedOptionKey: "y" });
    const radio = fieldDescriptor(get("e2"), "radio");
    expect(radio).toMatchObject({ id: "", name: "e", label: "Reply", options: "x\u0001y" });
    expect(fieldDescriptor(get("a"), "text")).toMatchObject({ id: "a", name: "a", label: "Message", ordinal: 0 });
    // Radio groups count once in ordinals.
    expect(fieldDescriptor(get("e2"), "radio").ordinal).toBe(4);
  });

  it("form descriptors keep only same-origin action paths and stay stable after mutations", () => {
    document.body.innerHTML = `<form id="f" action="/send?x=1"><textarea name="t"></textarea></form><form id="g" action="https://elsewhere.example/x"></form>`;
    const f = document.getElementById("f") as HTMLFormElement;
    const d1 = formDescriptor(f);
    expect(d1.action).toBe("/send");
    expect(formDescriptor(document.getElementById("g")!).action).toBe("");
    f.append(document.createElement("input"));
    resetCaches();
    expect(formDescriptor(f)).toEqual(d1);
  });

  it("virtual containers group by nearest semantic region, else the control alone", () => {
    document.body.innerHTML = `<section aria-label="Feedback"><textarea id="a"></textarea></section><div><input id="b"></div>`;
    expect(containerOf(document.getElementById("a") as Control).tagName).toBe("SECTION");
    const b = document.getElementById("b") as Control;
    expect(containerOf(b)).toBe(b);
    expect(formDescriptor(containerOf(b))).toMatchObject({ virtual: true });
  });

  it("open shadow roots are discovered", () => {
    document.body.innerHTML = `<div id="h"></div>`;
    const root = document.getElementById("h")!.attachShadow({ mode: "open" });
    root.innerHTML = `<textarea id="s"></textarea>`;
    expect(allControls().map((c) => c.id)).toContain("s");
  });
});

describe("applyValue", () => {
  it("sets text through the native setter and fires input/change", () => {
    document.body.innerHTML = `<textarea id="a"></textarea>`;
    const el = document.getElementById("a") as HTMLTextAreaElement;
    const seen: string[] = [];
    el.addEventListener("input", (e) => seen.push(`input:${e.isTrusted}`));
    el.addEventListener("change", () => seen.push("change"));
    expect(applyValue(el, { kind: "text", text: "restored" })).toBe(true);
    expect(el.value).toBe("restored");
    expect(seen).toEqual(["input:false", "change"]);
  });

  it("refuses option values that no longer exist or are disabled", () => {
    document.body.innerHTML = `<select id="s"><option value="a">A</option><option value="b" disabled>B</option></select>
      <input type="radio" name="r" id="r1" value="x"><input type="radio" name="r" id="r2" value="x">`;
    const s = document.getElementById("s") as HTMLSelectElement;
    expect(applyValue(s, { kind: "select", values: ["zzz"] })).toBe(false);
    expect(applyValue(s, { kind: "select", values: ["b"] })).toBe(false);
    expect(applyValue(s, { kind: "select", values: ["a"] })).toBe(true);
    // Duplicate radio option keys are not unique → refused.
    expect(applyValue(document.getElementById("r1") as HTMLInputElement, { kind: "radio", selectedOptionKey: "x" })).toBe(false);
  });

  it("fingerprints distinguish values", () => {
    expect(fingerprint({ kind: "text", text: "a" })).not.toBe(fingerprint({ kind: "text", text: "b" }));
    expect(fingerprint({ kind: "text", text: "a" })).toBe(fingerprint({ kind: "text", text: "a" }));
  });
});
