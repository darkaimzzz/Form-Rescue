/**
 * Metadata-only field eligibility. Nothing in this module reads a field value:
 * callers build a FieldMeta from attributes and label text, then decide.
 * Precedence (PRD §4.3): forbidden context and site policy are enforced by the
 * caller; this module covers sensitive form context → opt-outs → control
 * support → control state → autocomplete tokens → sensitive metadata terms.
 */

export type FieldKind = "text" | "select" | "checkbox" | "radio";

export interface FieldMeta {
  tag: "input" | "textarea" | "select";
  /** Lowercased `type` attribute; empty/unknown input types are treated as text. */
  type: string;
  autocomplete: string;
  /** `autocomplete="off"` on the owning form. */
  formAutocompleteOff: boolean;
  /** `data-form-rescue="off"` on the control or any ancestor. */
  optOut: boolean;
  disabled: boolean;
  readOnly: boolean;
  inert: boolean;
  visible: boolean;
  multiple?: boolean;
  id: string;
  name: string;
  labelText: string;
  ariaLabel: string;
  placeholder: string;
  /** Nearest fieldset legend / group label, bounded. */
  groupLabel: string;
}

export type ExclusionReason =
  | "sensitive-form"
  | "opted-out"
  | "autocomplete-off"
  | "unsupported-type"
  | "not-editable"
  | "sensitive-autocomplete"
  | "sensitive-metadata";

export type Eligibility =
  | { eligible: true; kind: FieldKind; search: boolean }
  | { eligible: false; reason: ExclusionReason };

/** Bound on any metadata string we inspect (PRD: bounded metadata only). */
export const META_LIMIT = 200;

const TEXT_TYPES = new Set(["text", ""]);

/** autocomplete tokens that make a control ineligible (credentials, payment, contact, identity). */
const SENSITIVE_AUTOCOMPLETE = [
  /^(current|new)-password$/,
  /^one-time-code$/,
  /^webauthn$/,
  /^username$/,
  /^cc-/,
  /^transaction-/,
  /^(name|honorific-prefix|given-name|additional-name|family-name|honorific-suffix|nickname)$/,
  /^email$/,
  /^impp$/,
  /^tel(-.*)?$/,
  /^(street-address|address-line\d|address-level\d|postal-code|country|country-name)$/,
  /^bday(-.*)?$/,
  /^sex$/,
];

export function isSensitiveAutocomplete(autocomplete: string): boolean {
  return autocomplete
    .toLowerCase()
    .split(/\s+/)
    .some((t) => SENSITIVE_AUTOCOMPLETE.some((re) => re.test(t)));
}

/**
 * Normalize metadata into space-separated lowercase tokens: splits camelCase,
 * folds Unicode compatibility forms and removes diacritics.
 */
export function normalizeTokens(text: string): string[] {
  return text
    .slice(0, META_LIMIT)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const LEET: Record<string, string> = { "@": "a", "0": "o", "1": "i", $: "s", "3": "e", "5": "s" };

/**
 * Terms indicating secrets, credentials, payment, government identity or
 * medical records. Multi-word phrases match token sequences and their joined
 * form ("api key" also matches "apiKey" and "apikey"). Long single words match
 * as substrings so "newPassword1" is caught; short words match whole tokens.
 * Non-Latin scripts match as substrings. Documented in docs/privacy.md.
 */
const SECRET_TERMS = [
  // credentials (en, de, es, fr, pt, nl, it, pl, ru, zh, ja, ko, ar, hi)
  "password", "passwd", "passphrase", "passcode", "passwort", "kennwort", "contrasena",
  "mot de passe", "senha", "wachtwoord", "haslo", "пароль", "密码", "密碼", "パスワード",
  "비밀번호", "كلمة المرور", "पासवर्ड", "pwd",
  // one-time codes and authentication
  "otp", "one time code", "one time password", "verification code", "security code",
  "auth code", "authentication code", "2fa", "mfa", "totp", "authenticator",
  // secrets
  "token", "api key", "access key", "secret", "private key", "seed phrase", "mnemonic",
  "recovery phrase", "recovery code", "backup code", "pin",
  // payment and banking
  "credit card", "debit card", "card number", "cardnumber", "ccnumber", "cvv", "cvv2", "cvc",
  "csc", "card verification", "iban", "routing number", "account number", "sort code", "swift",
  "bic", "bank account",
  // government identity
  "ssn", "social security", "national id", "national insurance", "aadhaar", "aadhar",
  "passport", "driver license", "drivers license", "driving licence", "tax id", "nif", "dni",
  "curp", "cpf", "personnummer",
  // medical records
  "diagnosis", "medical record", "mrn", "health insurance", "patient id", "nhs number",
  "medicare",
];

/** Personal contact/identity terms: applied to single-line inputs only, so prose fields such as "Message for our phone team" stay eligible. */
const CONTACT_TERMS = [
  "email", "e mail", "phone", "telephone", "mobile", "username", "user name", "login",
  "street address", "home address", "postal address", "address", "zip", "zipcode", "postcode",
  "postal code", "birthday", "date of birth", "dob", "full name", "first name", "last name",
  "surname",
];

/** Ambiguous short tokens that only count with a qualifying neighbour token. */
const CONTEXT_TERMS: Record<string, string[]> = {
  pan: ["card", "number", "no", "id"],
  tin: ["tax", "number", "no", "id"],
  sin: ["insurance", "number", "no"],
};

const SUBSTRING_MIN = 6;

function matchesTerm(tokens: string[], joined: string, compact: string, leet: string, term: string): boolean {
  const termTokens = normalizeTokens(term);
  if (termTokens.length === 0) return false;
  if (/[^\p{Script=Latin}\p{N}\s]/u.test(term)) return joined.includes(termTokens.join(" "));
  if (termTokens.length > 1) {
    const flat = termTokens.join("");
    return ` ${joined} `.includes(` ${termTokens.join(" ")} `) || compact.includes(flat) || leet.includes(flat);
  }
  const t = termTokens[0]!;
  if (t.length >= SUBSTRING_MIN) return compact.includes(t) || leet.includes(t);
  return tokens.includes(t);
}

export function hasSensitiveTerms(texts: string[], { includeContact }: { includeContact: boolean }): boolean {
  const raw = texts.map((t) => t.slice(0, META_LIMIT)).join(" ");
  const tokens = normalizeTokens(raw);
  const joined = tokens.join(" ");
  const compact = tokens.join("");
  const leet = raw
    .toLowerCase()
    .replace(/[@01$35]/g, (c) => LEET[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, "");
  const terms = includeContact ? [...SECRET_TERMS, ...CONTACT_TERMS] : SECRET_TERMS;
  if (terms.some((term) => matchesTerm(tokens, joined, compact, leet, term))) return true;
  for (const [term, context] of Object.entries(CONTEXT_TERMS)) {
    if (!tokens.includes(term)) continue;
    if (context.some((c) => tokens.includes(c))) return true;
    if (term === "pan" && /\bPAN\b/.test(raw)) return true;
  }
  return false;
}

function metaTexts(m: FieldMeta): string[] {
  return [m.id, m.name, m.labelText, m.ariaLabel, m.placeholder, m.groupLabel];
}

const HARD_EXCLUDED_TYPES = new Set([
  "password", "hidden", "file", "button", "submit", "reset", "image",
  "email", "tel", "url", "number", "date", "datetime-local", "month", "week", "time",
  "range", "color",
]);

function kindOf(m: FieldMeta): { kind: FieldKind; search: boolean } | null {
  if (m.tag === "textarea") return { kind: "text", search: false };
  if (m.tag === "select") return { kind: "select", search: false };
  if (HARD_EXCLUDED_TYPES.has(m.type)) return null;
  if (TEXT_TYPES.has(m.type)) return { kind: "text", search: false };
  if (m.type === "search") return { kind: "text", search: true };
  if (m.type === "checkbox") return { kind: "checkbox", search: false };
  if (m.type === "radio") return { kind: "radio", search: false };
  // Unknown type strings behave as text in browsers; the input's .type getter already maps them to "text".
  return null;
}

/**
 * True when this control makes its whole form sensitive (password, OTP,
 * payment or identity-secret indicators).
 */
export function isFormPoisoningControl(m: FieldMeta): boolean {
  if (m.tag === "input" && m.type === "password") return true;
  const ac = m.autocomplete.toLowerCase().split(/\s+/);
  if (ac.some((t) => /^(current-password|new-password|one-time-code|webauthn)$/.test(t) || /^cc-/.test(t))) return true;
  return hasSensitiveTerms(metaTexts(m), { includeContact: false });
}

export function classifyField(m: FieldMeta, ctx: { sensitiveForm: boolean }): Eligibility {
  if (ctx.sensitiveForm) return { eligible: false, reason: "sensitive-form" };
  if (m.optOut) return { eligible: false, reason: "opted-out" };
  const ac = m.autocomplete.toLowerCase().trim();
  if (m.formAutocompleteOff || ac === "off") return { eligible: false, reason: "autocomplete-off" };
  const kind = kindOf(m);
  if (!kind) return { eligible: false, reason: "unsupported-type" };
  if (m.disabled || m.readOnly || m.inert || !m.visible) return { eligible: false, reason: "not-editable" };
  if (isSensitiveAutocomplete(ac)) return { eligible: false, reason: "sensitive-autocomplete" };
  const singleLine = m.tag === "input";
  if (hasSensitiveTerms(metaTexts(m), { includeContact: singleLine })) {
    return { eligible: false, reason: "sensitive-metadata" };
  }
  return { eligible: true, ...kind };
}
