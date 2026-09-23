/**
 * Generates browser-specific manifests. The base is shared; only the
 * background and browser_specific_settings differ. See docs/permissions.md.
 */
export const FIREFOX_ID = "{6840dc1a-5f46-48d7-a8a0-e00d34c14f5c}";

/** Oldest versions actually validated (docs/browser-support.md). Raise/lower only with evidence. */
export const MIN_VERSIONS = { chrome: "153", firefox: "156.0" };

/** SemVer (x.y.z[-pre.n]) → numeric manifest version (x.y.z[.n]); see docs/release.md. */
export function manifestVersion(semver) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-(?:alpha|beta|rc)\.(\d+))?$/.exec(semver);
  if (!m) throw new Error(`Unsupported version: ${semver}`);
  return m[4] ? `${m[1]}.${m[2]}.${m[3]}.${m[4]}` : `${m[1]}.${m[2]}.${m[3]}`;
}

export function buildManifest(target, { version, e2e = false }) {
  const icons = { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" };
  const manifest = {
    manifest_version: 3,
    name: "Form Rescue",
    short_name: "Form Rescue",
    description: "Recover saved form drafts on the sites you choose. Local to your browser. Open source.",
    version: manifestVersion(version),
    version_name: target === "chrome" ? version : undefined,
    icons,
    action: { default_title: "Form Rescue", default_popup: "popup/index.html", default_icon: icons },
    options_ui: { page: "pages/options/index.html", open_in_tab: true },
    permissions: ["storage", "scripting", "activeTab", "alarms"],
    optional_host_permissions: ["https://*/*", "http://*/*"],
    incognito: "not_allowed",
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'",
    },
  };
  if (target === "chrome") {
    manifest.background = { service_worker: "background.js" };
    manifest.minimum_chrome_version = MIN_VERSIONS.chrome;
  } else {
    delete manifest.version_name;
    manifest.background = { scripts: ["background.js"] };
    manifest.browser_specific_settings = {
      gecko: {
        id: FIREFOX_ID,
        strict_min_version: MIN_VERSIONS.firefox,
        // Form Rescue collects and transmits no data.
        data_collection_permissions: { required: ["none"] },
      },
    };
  }
  if (e2e) {
    // Test-only build (never packaged): pre-grants the local fixture hosts because
    // automation cannot click the browser's permission prompt. See docs/testing.md.
    manifest.host_permissions = ["http://127.0.0.1/*", "http://localhost/*"];
    manifest.name = "Form Rescue (E2E test build)";
  }
  return JSON.parse(JSON.stringify(manifest));
}
