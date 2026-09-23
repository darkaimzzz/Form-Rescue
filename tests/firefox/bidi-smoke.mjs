/**
 * Real Firefox extension smoke test over WebDriver BiDi.
 *
 * Playwright's Firefox build cannot load extensions, so this drives an
 * installed desktop Firefox directly: installs the Firefox E2E build as a
 * temporary add-on (webExtension.install), then uses trusted input
 * (input.performActions) for the enable → type → saved → reload → review →
 * restore flow, plus a sensitive-form check.
 *
 * Usage: pnpm test:firefox   (env FIREFOX_BIN overrides the Firefox path)
 * Evidence: test-results/firefox-smoke.json
 */
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FIREFOX_ID } from "../../scripts/build-manifests/manifest.mjs";
import { startServers } from "../fixtures/server.mjs";

const FIREFOX =
  process.env.FIREFOX_BIN ??
  ["C:/Program Files/Mozilla Firefox/firefox.exe", "/usr/bin/firefox", "/Applications/Firefox.app/Contents/MacOS/firefox"].find((p) => existsSync(p));
const EXT = path.resolve("apps/extension/dist-e2e/firefox");
const UUID = "5f0e7a52-0d4e-4b8a-9c1e-f00dfeed0001";
const BASE = `moz-extension://${UUID}`;
const A = "http://127.0.0.1:4173";
const PORT = 9333 + Math.floor(Math.random() * 500);

if (!FIREFOX) throw new Error("Firefox not found; set FIREFOX_BIN.");
if (!existsSync(path.join(EXT, "manifest.json"))) throw new Error("Build first: pnpm --filter @form-rescue/extension build:e2e:firefox");

const stopServers = await startServers();
const profile = await mkdtemp(path.join(tmpdir(), "fr-ff-"));
await writeFile(
  path.join(profile, "user.js"),
  [
    `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [FIREFOX_ID]: UUID }))});`,
    `user_pref("browser.shell.checkDefaultBrowser", false);`,
    `user_pref("datareporting.policy.dataSubmissionEnabled", false);`,
    `user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);`,
    `user_pref("browser.aboutwelcome.enabled", false);`,
  ].join("\n"),
);
// Test-only: pre-record the user's grant for the two fixture hosts (what accepting Firefox's
// permission prompt stores), because headless automation cannot click browser prompts.
await writeFile(
  path.join(profile, "extension-preferences.json"),
  JSON.stringify({ [FIREFOX_ID]: { permissions: [], origins: ["http://127.0.0.1/*", "http://localhost/*"] } }),
);
const proc = spawn(FIREFOX, ["-headless", "-no-remote", "-profile", profile, "--remote-debugging-port", String(PORT), "-remote-allow-system-access"], {
  stdio: "ignore",
});

let ws;
for (let i = 0; i < 100 && !ws; i++) {
  await new Promise((r) => setTimeout(r, 200));
  ws = await new Promise((resolve) => {
    const s = new WebSocket(`ws://127.0.0.1:${PORT}/session`);
    s.onopen = () => resolve(s);
    s.onerror = () => resolve(undefined);
  });
}
if (!ws) throw new Error("Could not connect to Firefox WebDriver BiDi.");

let nextId = 1;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.type === "error") reject(new Error(`${msg.error}: ${msg.message}`));
    else resolve(msg.result);
  }
};
const cmd = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(context, expression) {
  const r = await cmd("script.evaluate", { expression, target: { context }, awaitPromise: true, resultOwnership: "none" });
  if (r.type === "exception") throw new Error(r.exceptionDetails?.text ?? "script exception");
  return r.result?.value;
}
async function node(context, css) {
  for (let i = 0; i < 50; i++) {
    const r = await cmd("browsingContext.locateNodes", { context, locator: { type: "css", value: css } });
    if (r.nodes.length) return r.nodes[0];
    await sleep(100);
  }
  throw new Error(`Not found: ${css}`);
}
async function click(context, css) {
  const n = await node(context, css);
  await cmd("input.performActions", {
    context,
    actions: [
      {
        type: "pointer",
        id: "mouse",
        actions: [
          { type: "pointerMove", x: 0, y: 0, origin: { type: "element", element: { sharedId: n.sharedId } } },
          { type: "pointerDown", button: 0 },
          { type: "pointerUp", button: 0 },
        ],
      },
    ],
  });
  await cmd("input.releaseActions", { context });
}
async function type(context, css, text) {
  await click(context, css);
  const keys = [...text].flatMap((ch) => [
    { type: "keyDown", value: ch },
    { type: "keyUp", value: ch },
  ]);
  await cmd("input.performActions", { context, actions: [{ type: "key", id: "kb", actions: keys }] });
}
async function newTab(url) {
  const { context } = await cmd("browsingContext.create", { type: "tab" });
  await cmd("browsingContext.navigate", { context, url, wait: "complete" });
  return context;
}
async function waitFor(context, expression, timeout = 10_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(context, expression).catch(() => false)) return true;
    await sleep(200);
  }
  return false;
}
async function contextFor(urlPrefix, timeout = 10_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const { contexts } = await cmd("browsingContext.getTree", {});
    const hit = contexts.find((c) => c.url.startsWith(urlPrefix));
    if (hit) return hit.context;
    await sleep(200);
  }
  throw new Error(`No context for ${urlPrefix}`);
}
let ui;
/** Extension pages cannot be navigated to over BiDi; open them from inside the extension instead. */
async function extTab(pagePath) {
  const url = `${BASE}/${pagePath}`;
  await evaluate(ui, `browser.tabs.create({ url: ${JSON.stringify(url)} }).then(() => true)`);
  const ctx = await contextFor(url);
  await waitFor(ctx, "document.readyState === 'complete'");
  return ctx;
}
const buttonByText = (text) => `[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(text)})`;
/** BiDi input actions are unavailable in privileged (extension) contexts, so extension buttons get DOM clicks. */
async function clickButton(context, text) {
  await evaluate(context, `(${buttonByText(text)}).click()`);
}

let version = "unknown";
try {
  const session = await cmd("session.new", { capabilities: {} });
  version = `${session.capabilities.browserName} ${session.capabilities.browserVersion}`;
  console.log(`Firefox: ${version}`);
  const { extension } = await cmd("webExtension.install", { extensionData: { type: "path", path: EXT } });
  check("temporary add-on installs", extension === FIREFOX_ID, extension);

  // The extension opens its onboarding page on first install; use it as the trusted UI context.
  ui = await contextFor(`${BASE}/pages/onboarding/`);
  const page = await newTab(`${A}/demo.html`);
  // Match patterns cannot carry ports in Firefox; filter tabs in script instead.
  const tabId = await evaluate(ui, `browser.tabs.query({}).then((t) => t.find((x) => x.url === "${A}/demo.html")?.id)`);
  check("extension page can see the fixture tab", typeof tabId === "number", String(tabId));

  const popup = await extTab(`popup/index.html?tab=${tabId}`);
  await waitFor(popup, `!!${buttonByText("Enable protection for this site")}`);
  await clickButton(popup, "Enable protection for this site");
  check("enable flow reaches Protection on", await waitFor(popup, `document.body.innerText.includes("Protection on")`));
  const reg = await evaluate(ui, `browser.scripting.getRegisteredContentScripts().then((r) => r.length)`);
  check("content script registered for the site", reg === 1, String(reg));

  const TEXT = "Firefox synthetic draft text";
  await type(page, "#details", TEXT);
  await click(page, "#subject");
  check("save acknowledged after durable commit", await waitFor(popup, `document.body.innerText.includes("Saved locally at")`, 15_000));

  await cmd("browsingContext.reload", { context: page, wait: "complete" });
  check("field empty after reload", (await evaluate(page, `document.querySelector("#details").value`)) === "");
  const rec = await extTab(`pages/recovery/index.html?tab=${tabId}`);
  await waitFor(rec, `!!${buttonByText("Review this draft")}`);
  await clickButton(rec, "Review this draft");
  await waitFor(rec, `document.body.innerText.includes("Restoring makes these values available")`);
  check("page untouched before confirmation", (await evaluate(page, `document.querySelector("#details").value`)) === "");
  await clickButton(rec, "Restore selected fields");
  check("restore reports success", await waitFor(rec, `/Restored 1, skipped 0/.test(document.body.innerText)`));
  check("restored exact text", (await evaluate(page, `document.querySelector("#details").value`)) === TEXT);

  // Sensitive form: nothing stored.
  const login = await newTab(`${A}/login.html`);
  await type(login, "#pw", "synthetic-firefox-pass");
  await type(login, "#note", "note in a login form");
  await click(login, "#user");
  await sleep(2000);
  const dump = await evaluate(
    ui,
    `new Promise((res) => { const r = indexedDB.open("form-rescue"); r.onsuccess = () => { const out = {}; const db = r.result; const names = [...db.objectStoreNames]; let n = names.length; for (const s of names) { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => { out[s] = q.result; if (--n === 0) res(JSON.stringify(out)); }; } }; })`,
  );
  check("sensitive login form never stored", !dump.includes("synthetic-firefox-pass") && !dump.includes("note in a login form"));
  check("draft stored in extension IndexedDB", dump.includes(TEXT));

  // Delete all from settings and verify empty.
  const r = JSON.parse(await evaluate(ui, `browser.runtime.sendMessage({ type: "deleteAll" }).then(JSON.stringify)`));
  check("delete all verifies empty library", r?.ok === true && r.remaining === 0, JSON.stringify(r));
} catch (e) {
  check("smoke run completed", false, String(e?.message ?? e));
} finally {
  await cmd("session.end").catch(() => undefined);
  ws.close();
  proc.kill();
  await sleep(500);
  await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  stopServers();
}

await mkdir("test-results", { recursive: true });
const evidence = { browser: version, os: `${process.platform}`, ranAt: new Date().toISOString(), results };
await writeFile("test-results/firefox-smoke.json", JSON.stringify(evidence, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
