import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { classifyField, hasSensitiveTerms, isFormPoisoningControl, isSensitiveAutocomplete, normalizeTokens, type FieldMeta } from "@form-rescue/core";

const base: FieldMeta = {
  tag: "input",
  type: "text",
  autocomplete: "",
  formAutocompleteOff: false,
  optOut: false,
  disabled: false,
  readOnly: false,
  inert: false,
  visible: true,
  id: "",
  name: "",
  labelText: "",
  ariaLabel: "",
  placeholder: "",
  groupLabel: "",
};
const meta = (o: Partial<FieldMeta>): FieldMeta => ({ ...base, ...o });
const ok = { sensitiveForm: false };

describe("supported controls", () => {
  it.each([
    [{ tag: "textarea" as const, type: "textarea" }, "text"],
    [{ type: "text" }, "text"],
    [{ type: "" }, "text"],
    [{ tag: "select" as const, type: "select-one" }, "select"],
    [{ type: "checkbox" }, "checkbox"],
    [{ type: "radio" }, "radio"],
  ])("%o is eligible as %s", (o, kind) => {
    expect(classifyField(meta(o), ok)).toEqual({ eligible: true, kind, search: false });
  });

  it("search inputs are eligible only as opt-in search fields", () => {
    expect(classifyField(meta({ type: "search" }), ok)).toEqual({ eligible: true, kind: "text", search: true });
  });

  it.each([
    "password",
    "hidden",
    "file",
    "button",
    "submit",
    "reset",
    "image",
    "email",
    "tel",
    "url",
    "number",
    "date",
    "datetime-local",
    "month",
    "week",
    "time",
    "range",
    "color",
  ])("type=%s is hard-excluded", (type) => {
    expect(classifyField(meta({ type }), ok)).toMatchObject({ eligible: false });
  });

  it.each([{ disabled: true }, { readOnly: true }, { inert: true }, { visible: false }])("%o is not editable", (o) => {
    expect(classifyField(meta(o), ok)).toEqual({ eligible: false, reason: "not-editable" });
  });
});

describe("opt-outs and precedence", () => {
  it("sensitive form context wins over everything", () => {
    expect(classifyField(meta({ tag: "textarea" }), { sensitiveForm: true })).toEqual({ eligible: false, reason: "sensitive-form" });
  });
  it("data-form-rescue=off", () => {
    expect(classifyField(meta({ optOut: true }), ok)).toEqual({ eligible: false, reason: "opted-out" });
  });
  it("autocomplete=off on field or form", () => {
    expect(classifyField(meta({ autocomplete: "off" }), ok)).toEqual({ eligible: false, reason: "autocomplete-off" });
    expect(classifyField(meta({ autocomplete: " OFF " }), ok)).toEqual({ eligible: false, reason: "autocomplete-off" });
    expect(classifyField(meta({ formAutocompleteOff: true }), ok)).toEqual({ eligible: false, reason: "autocomplete-off" });
  });
});

describe("autocomplete tokens", () => {
  it.each([
    "current-password",
    "new-password",
    "one-time-code",
    "username",
    "cc-number",
    "cc-csc",
    "cc-exp",
    "transaction-amount",
    "email",
    "tel",
    "tel-national",
    "street-address",
    "address-line1",
    "postal-code",
    "bday",
    "bday-year",
    "given-name",
    "section-a shipping street-address",
    "billing cc-name",
    "webauthn",
  ])("%s is sensitive", (ac) => {
    expect(isSensitiveAutocomplete(ac)).toBe(true);
    expect(classifyField(meta({ autocomplete: ac }), ok)).toEqual({ eligible: false, reason: "sensitive-autocomplete" });
  });
  it.each(["on", "", "organization-title", "section-x"])("%s is not sensitive", (ac) => {
    expect(isSensitiveAutocomplete(ac)).toBe(false);
  });
});

describe("metadata terms", () => {
  it.each([
    { name: "password" },
    { id: "userPassword" },
    { name: "new_passwd" },
    { labelText: "Passcode" },
    { ariaLabel: "Your PIN" },
    { placeholder: "Enter OTP" },
    { labelText: "Verification code" },
    { name: "api_key" },
    { id: "apiKey" },
    { labelText: "Client secret" },
    { labelText: "Seed phrase" },
    { labelText: "Recovery code" },
    { name: "ssn" },
    { labelText: "National ID" },
    { labelText: "Aadhaar number" },
    { labelText: "PAN card" },
    { labelText: "PAN" },
    { labelText: "Passport number" },
    { labelText: "Routing number" },
    { name: "iban" },
    { labelText: "CVV" },
    { labelText: "Card number" },
    { labelText: "Diagnosis" },
    { labelText: "Medical record number" },
    { labelText: "Contraseña" },
    { labelText: "Mot de passe" },
    { labelText: "Passwort" },
    { labelText: "Пароль" },
    { labelText: "密码" },
    { labelText: "パスワード" },
    { labelText: "비밀번호" },
    { name: "p@ssw0rd" },
    { labelText: "Access token" },
    { labelText: "Tax ID" },
    { labelText: "TIN number" },
    { groupLabel: "Payment card" + " number" },
  ])("%o is excluded", (o) => {
    expect(classifyField(meta(o), ok)).toEqual({ eligible: false, reason: "sensitive-metadata" });
  });

  it.each([
    { labelText: "Email address" },
    { name: "phone" },
    { labelText: "Date of birth" },
    { labelText: "Street address" },
    { labelText: "First name" },
    { name: "zip" },
    { labelText: "Username" },
  ])("contact metadata %o excludes single-line inputs", (o) => {
    expect(classifyField(meta(o), ok)).toEqual({ eligible: false, reason: "sensitive-metadata" });
  });

  it("contact terms do not exclude prose textareas", () => {
    expect(classifyField(meta({ tag: "textarea", labelText: "Message for our phone support team" }), ok)).toMatchObject({ eligible: true });
    expect(classifyField(meta({ tag: "textarea", labelText: "Anything about your address change?" }), ok)).toMatchObject({ eligible: true });
  });

  it.each([
    { labelText: "Describe the problem" },
    { labelText: "Spinning wheel details" },
    { name: "shipping_notes" },
    { labelText: "Pan-fried recipe notes" },
    { labelText: "Tinned food preferences" },
    { labelText: "Pinned message" },
    { labelText: "Tokenomics essay" },
    { labelText: "Project name" },
    { labelText: "Cover letter" },
    { labelText: "Why do you want this job?" },
    { labelText: "Company" },
    { labelText: "Topping options" },
  ])("false positives avoided for %o", (o) => {
    expect(classifyField(meta({ tag: "textarea", ...o }), ok)).toMatchObject({ eligible: true });
  });

  it("normalizes camelCase, diacritics and full-width forms", () => {
    expect(normalizeTokens("newPassWord")).toEqual(["new", "pass", "word"]);
    expect(normalizeTokens("Contraseña")).toEqual(["contrasena"]);
    expect(hasSensitiveTerms(["ＰＡＳＳＷＯＲＤ"], { includeContact: false })).toBe(true);
  });

  it("bounds metadata length", () => {
    expect(hasSensitiveTerms(["x".repeat(500) + " password"], { includeContact: false })).toBe(false);
  });
});

describe("choice controls", () => {
  it.each([
    { type: "checkbox", labelText: "I agree to the terms" },
    { type: "checkbox", name: "gdpr_consent" },
    { type: "radio", groupLabel: "Payment method" },
    { type: "radio", groupLabel: "Billing plan" },
  ])("consent/payment choice %o is excluded", (o) => {
    expect(classifyField(meta(o), ok)).toEqual({ eligible: false, reason: "sensitive-metadata" });
  });
  it("choice terms do not affect prose fields", () => {
    expect(classifyField(meta({ tag: "textarea", labelText: "Do you agree with the proposal? Explain." }), ok)).toMatchObject({ eligible: true });
  });
});

describe("form poisoning", () => {
  it.each([
    meta({ type: "password" }),
    meta({ autocomplete: "one-time-code" }),
    meta({ autocomplete: "cc-number" }),
    meta({ name: "otp" }),
    meta({ labelText: "CVC" }),
  ])("%o poisons its form", (m) => {
    expect(isFormPoisoningControl(m)).toBe(true);
  });
  it("ordinary contact fields do not poison a form", () => {
    expect(isFormPoisoningControl(meta({ type: "email", name: "email" }))).toBe(false);
    expect(isFormPoisoningControl(meta({ tag: "textarea", name: "message" }))).toBe(false);
  });
});

describe("properties", () => {
  it("any meta with a secret term in any slot is never eligible", () => {
    const slot = fc.constantFrom("id", "name", "labelText", "ariaLabel", "placeholder", "groupLabel");
    const term = fc.constantFrom("password", "one time code", "api key", "credit card", "passport", "ssn", "cvv");
    fc.assert(
      fc.property(slot, term, fc.string({ maxLength: 20 }), (s, t, noise) => {
        const m = meta({ tag: "textarea", [s]: `${noise.replace(/[\p{L}\p{N}]/gu, "")} ${t}` });
        expect(classifyField(m, ok).eligible).toBe(false);
      }),
    );
  });
});
