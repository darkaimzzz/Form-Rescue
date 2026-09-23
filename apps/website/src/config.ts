/**
 * Every public link and release fact lives here, validated once. Unknown
 * values are null; components must render honest fallbacks, never inert
 * buttons. `pnpm release:validate --publish` fails while required values are null.
 */
function httpsUrl(v: string | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

const env = import.meta.env;

export const config = {
  siteOrigin: httpsUrl(env.PUBLIC_SITE_ORIGIN),
  repoUrl: httpsUrl(env.PUBLIC_REPO_URL),
  stores: {
    chrome: httpsUrl(env.PUBLIC_CHROME_STORE_URL),
    edge: httpsUrl(env.PUBLIC_EDGE_STORE_URL),
    firefox: httpsUrl(env.PUBLIC_FIREFOX_STORE_URL),
  },
  /** Release maturity shown on the site; matches README badge and CHANGELOG. */
  status: "alpha" as const,
  version: "0.1.0",
  /** Browser versions actually exercised (docs/browser-support.md). */
  tested: {
    chrome: "Chromium 153 (automated); Google Chrome 153 manual check pending",
    edge: "Microsoft Edge 153 (automated)",
    firefox: "Firefox 156 (automated smoke)",
  },
};

export const isPreview = config.siteOrigin === null;

export type Browser = keyof typeof config.stores;
export const browserNames: Record<Browser, string> = { chrome: "Chrome", edge: "Edge", firefox: "Firefox" };
