/**
 * Release validation (PRD §12.4, §15). Run after `pnpm package`:
 *   pnpm release:validate            local gates (manifests, bundles, ZIPs, versions, docs)
 *   pnpm release:validate --publish  also require every public publication input
 * Exit code 1 on any failure; each check is printed.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const publish = process.argv.includes("--publish");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
const read = (p) => readFile(p, "utf8").catch(() => "");
const { version } = JSON.parse(await read("package.json"));

// ---------------------------------------------------------------- manifests
const ALLOWED_PERMISSIONS = ["activeTab", "alarms", "scripting", "storage"];
for (const target of ["chrome", "firefox"]) {
  const m = JSON.parse(await read(`apps/extension/dist/${target}/manifest.json`));
  check(`${target}: manifest_version 3`, m.manifest_version === 3);
  check(
    `${target}: permissions exactly ${ALLOWED_PERMISSIONS.join(", ")}`,
    JSON.stringify([...m.permissions].sort()) === JSON.stringify(ALLOWED_PERMISSIONS),
    m.permissions.join(","),
  );
  check(`${target}: no required host permissions`, !m.host_permissions, JSON.stringify(m.host_permissions ?? null));
  check(`${target}: optional hosts are http/https only`, JSON.stringify(m.optional_host_permissions) === JSON.stringify(["https://*/*", "http://*/*"]));
  check(
    `${target}: no content_scripts/externally_connectable/web_accessible_resources`,
    !m.content_scripts && !m.externally_connectable && !m.web_accessible_resources,
  );
  check(`${target}: incognito not_allowed`, m.incognito === "not_allowed");
  const csp = m.content_security_policy?.extension_pages ?? "";
  check(
    `${target}: CSP script-src 'self', connect-src 'none', no unsafe-*`,
    /script-src 'self'/.test(csp) && /connect-src 'none'/.test(csp) && !/unsafe/.test(csp),
    csp,
  );
  const expected = version.replace(/-(alpha|beta|rc)\.(\d+)$/, ".$2");
  check(`${target}: manifest version matches package.json`, m.version === expected, `${m.version} vs ${version}`);
  if (target === "chrome") check("chrome: service worker background", m.background?.service_worker === "background.js");
  if (target === "firefox") {
    check("firefox: event-page background scripts", JSON.stringify(m.background?.scripts) === '["background.js"]');
    check("firefox: declares no data collection", JSON.stringify(m.browser_specific_settings?.gecko?.data_collection_permissions) === '{"required":["none"]}');
    check("firefox: add-on id set", /^\{[0-9a-f-]{36}\}$/.test(m.browser_specific_settings?.gecko?.id ?? ""));
  }
}

// ---------------------------------------------------------------- bundles
// Allowed: namespace/schema identifiers, React error docs, and the project's own user-clicked links.
const URL_ALLOW = [
  /^http:\/\/www\.w3\.org\//,
  /^https?:\/\/json-schema\.org\//,
  /^https:\/\/react\.dev\/errors\//,
  /^http:\/\/127\.0\.0\.1:4173\/demo\.html/,
  /^https?:\/\/\[\$\{/,
  /^https:\/\/form-rescue\.vercel\.app(\/|$)/,
  /^https:\/\/github\.com\/darkaimzzz\/Form-Rescue(\/|$|#)/,
];
const FORBIDDEN = [
  [/\bfetch\s*\(/, "fetch("],
  [/XMLHttpRequest/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/sendBeacon/, "sendBeacon"],
  [/\bEventSource\b/, "EventSource"],
  [/google-analytics|googletagmanager|gtag\(|segment\.(io|com)|sentry|mixpanel|amplitude|hotjar|posthog/i, "tracker"],
  [/importScripts\s*\(/, "importScripts"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS key"],
  [/__FR_E2E__|fr-handler|fr-commit/, "E2E-only instrumentation"],
];
async function jsFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await jsFiles(p)));
    else if (/\.(js|html|css)$/.test(e.name)) out.push(p);
  }
  return out;
}
for (const target of ["chrome", "firefox"]) {
  const files = await jsFiles(`apps/extension/dist/${target}`);
  const problems = [];
  for (const f of files) {
    const text = await read(f);
    for (const [re, label] of FORBIDDEN) if (re.test(text)) problems.push(`${path.basename(f)}: ${label}`);
    for (const u of text.match(/https?:\/\/[^\s"'`)<>\\]+/g) ?? []) if (!URL_ALLOW.some((re) => re.test(u))) problems.push(`${path.basename(f)}: URL ${u}`);
    if (f.endsWith(".html") && /<script(?![^>]*\bsrc=)[^>]*>\s*\S/.test(text)) problems.push(`${path.basename(f)}: inline script`);
    if (/<script[^>]+src="https?:/.test(text)) problems.push(`${path.basename(f)}: remote script`);
  }
  check(`${target}: bundles free of network APIs, trackers, remote code, secrets, test instrumentation`, problems.length === 0, problems.join("; "));
}

// ---------------------------------------------------------------- ZIPs
function zipNames(buf) {
  const names = new Map();
  let i = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(i + 10);
  let p = buf.readUInt32LE(i + 16);
  for (let n = 0; n < count; n++) {
    const len = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + len).toString("utf8");
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(local + 26);
    const data = buf.subarray(local + 30 + nlen, local + 30 + nlen + csize);
    names.set(name, () => inflateRawSync(data));
    p += 46 + len + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return names;
}
const sums = existsSync("release/SHA256SUMS.txt") ? await read("release/SHA256SUMS.txt") : "";
check("release/SHA256SUMS.txt exists", sums.length > 0);
for (const line of sums.trim().split("\n").filter(Boolean)) {
  const [hash, file] = line.split(/\s+/);
  const actual = createHash("sha256")
    .update(await readFile(`release/${file}`))
    .digest("hex");
  check(`checksum matches: ${file}`, actual === hash);
}
for (const target of ["chrome", "firefox"]) {
  const file = `release/form-rescue-${version}-${target}.zip`;
  if (!existsSync(file)) {
    check(`${target} ZIP present`, false, file);
    continue;
  }
  const names = zipNames(await readFile(file));
  const list = [...names.keys()];
  const manifest = JSON.parse(names.get("manifest.json")?.().toString("utf8") ?? "{}");
  check(`${target} ZIP: manifest at root with version ${manifest.version}`, !!manifest.version);
  check(
    `${target} ZIP: icons 16/32/48/128`,
    [16, 32, 48, 128].every((s) => list.includes(`icons/icon-${s}.png`)),
  );
  check(
    `${target} ZIP: background, content script, popup and pages`,
    [
      "background.js",
      "content.js",
      "popup/index.html",
      "pages/recovery/index.html",
      "pages/library/index.html",
      "pages/options/index.html",
      "pages/onboarding/index.html",
    ].every((f) => list.includes(f)),
  );
  check(
    `${target} ZIP: no dev host grants, source maps, profiles or secrets`,
    !manifest.host_permissions && !list.some((n) => /\.map$|\.pem$|\.env|Default\/|node_modules|\.test\./.test(n)),
    list.filter((n) => /\.map$|\.pem$/.test(n)).join(","),
  );
}
for (const f of ["sbom.cdx.json", "third-party-licenses.json", `form-rescue-${version}-source.zip`]) check(`release/${f} present`, existsSync(`release/${f}`));
if (existsSync("release/third-party-licenses.json")) {
  const lic = JSON.parse(await read("release/third-party-licenses.json"));
  const permissive = /^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2.0|0BSD)$/;
  check(
    "shipped dependency licenses are permissive and inventoried",
    lic.every((l) => permissive.test(l.license)),
    lic.map((l) => `${l.name}:${l.license}`).join(", "),
  );
  const notices = await read("docs/third-party-notices.md");
  check(
    "docs/third-party-notices.md lists every shipped dependency",
    lic.every((l) => notices.includes(l.name)),
  );
}

// ---------------------------------------------------------------- repository and docs
const changelog = await read("CHANGELOG.md");
check(`CHANGELOG has an entry for ${version}`, changelog.includes(`[${version}]`));
check("website config version matches", (await read("apps/website/src/config.ts")).includes(`version: "${version}"`));
for (const f of [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  "CLAUDE.md",
  "docs/PRD.md",
  "docs/architecture.md",
  "docs/threat-model.md",
  "docs/data-model.md",
  "docs/permissions.md",
  "docs/privacy.md",
  "docs/browser-support.md",
  "docs/testing.md",
  "docs/release.md",
  "docs/implementation-status.md",
  "docs/third-party-notices.md",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/bug.yml",
]) {
  check(`present: ${f}`, existsSync(f));
}
const site = await jsFiles("apps/website/dist").catch(() => []);
check("website built", site.length > 0);
const siteProblems = [];
for (const f of site) {
  const t = await read(f);
  if (/example\.com|form-rescue\.invalid/.test(t)) siteProblems.push(`${f}: placeholder domain`);
  if (/<script[^>]+src="https?:/.test(t)) siteProblems.push(`${f}: remote script`);
}
check("website has no placeholder domains or remote scripts", siteProblems.length === 0, siteProblems.join("; "));

// ---------------------------------------------------------------- publication inputs (external)
if (publish) {
  const env = process.env;
  const need = {
    PUBLIC_SITE_ORIGIN: "production website origin",
    VITE_FR_WEBSITE_ORIGIN: "website origin baked into the extension build",
  };
  for (const [k, what] of Object.entries(need)) check(`publish input: ${k} (${what})`, /^https:\/\//.test(env[k] ?? ""));
  const license = await read("LICENSE");
  check("publish input: LICENSE copyright holder set", !/COPYRIGHT HOLDER TO BE CONFIRMED/.test(license));
  const owners = existsSync(".github/CODEOWNERS") ? await read(".github/CODEOWNERS") : "";
  check("publish input: CODEOWNERS names real maintainers", /^\*\s+@\S+/m.test(owners));
  const security = await read("SECURITY.md");
  check("publish input: private vulnerability reporting route configured", !/NOT YET CONFIGURED/.test(security));
  const coc = await read("CODE_OF_CONDUCT.md");
  check("publish input: conduct reporting route configured", !/NOT YET CONFIGURED/.test(coc));
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${publish ? " (publication mode)" : ""}.`);
process.exit(failed.length ? 1 : 0);
