/**
 * Minimal WebExtensions adapter. Chrome MV3 and Firefox MV3 both expose
 * promise-returning APIs; Firefox also provides `browser`. Everything uses
 * this one handle so browser differences stay in this file.
 */
declare const browser: typeof chrome | undefined;

export const ext: typeof chrome = typeof browser !== "undefined" ? browser : chrome;

export const isFirefox = (): boolean => ext.runtime.getURL("").startsWith("moz-extension:");

/** Match pattern for a single scheme + hostname. Ports cannot be expressed in match patterns; the stricter full-origin policy is applied internally. */
export function originPattern(origin: string): string {
  const u = new URL(origin);
  return `${u.protocol}//${u.hostname}/*`;
}

export function isSupportedUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
