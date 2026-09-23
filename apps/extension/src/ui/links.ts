/**
 * Public links are build-time configuration (see release/config in docs/release.md).
 * They are null until a real website/repository exists; UI must handle null.
 */
function clean(v: unknown): string | null {
  return typeof v === "string" && /^https:\/\/[^\s]+$/.test(v) ? v.replace(/\/$/, "") : null;
}

export const WEBSITE_ORIGIN = clean(import.meta.env.VITE_FR_WEBSITE_ORIGIN);
export const REPO_URL = clean(import.meta.env.VITE_FR_REPO_URL) ?? "https://github.com/darkaimzzz/Form-Rescue";
export const PRACTICE_FORM_URL = WEBSITE_ORIGIN ? `${WEBSITE_ORIGIN}/try/` : null;
