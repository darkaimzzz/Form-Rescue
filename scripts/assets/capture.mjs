/**
 * Captures real screenshots and a real recording of the extension working on
 * the synthetic fixture pages. Uses the E2E build (it pre-grants the local
 * fixture host because automation cannot click the browser's permission
 * prompt); the recording's captions say so. No real data is involved.
 *
 * Run: pnpm assets:capture   (builds dist-e2e first)
 * Output: assets/screenshots/*, assets/recordings/*, copies in apps/website/public/{images,demos}
 */
import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServers } from "../../tests/fixtures/server.mjs";

const EXT = path.resolve("apps/extension/dist-e2e/chrome");
const A = "http://127.0.0.1:4173";
const SHOTS = "assets/screenshots";
const REC = "assets/recordings";
const SITE_IMG = "apps/website/public/images";
const SITE_DEMO = "apps/website/public/demos";
for (const d of [SHOTS, REC, SITE_IMG, SITE_DEMO]) await mkdir(d, { recursive: true });

const SUBJECT = "Export stuck on CSV";
const TEXT = "Since this morning the export button keeps spinning after I choose CSV. I tried two browsers and cleared my cache.";

const stopServers = await startServers();
const profile = await mkdtemp(path.join(tmpdir(), "fr-capture-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  colorScheme: "light",
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const sw = context.serviceWorkers().find((w) => w.url().endsWith("/background.js")) ?? (await context.waitForEvent("serviceworker"));
const extId = new URL(sw.url()).host;
const ext = (p) => `chrome-extension://${extId}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function tabId(url) {
  for (let i = 0; i < 50; i++) {
    const id = await sw.evaluate(async (u) => (await chrome.tabs.query({})).filter((t) => t.url === u).at(-1)?.id, url);
    if (id !== undefined) return id;
    await sleep(100);
  }
  throw new Error(`no tab for ${url}`);
}
for (const p of context.pages()) await p.close(); // onboarding tab from install

// ---------------------------------------------------------------- recording
const stage = await context.newPage();
await stage.setViewportSize({ width: 1280, height: 800 });
await stage.setContent(`<!doctype html><html><head><style>
  body{margin:0;background:#dfe3e8;font:15px system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
  .chrome{height:76px;background:#f1f3f5;border-bottom:1px solid #cfd5dc}
  .tabs{display:flex;gap:4px;padding:8px 10px 0}
  .tab{background:#e3e7ec;border-radius:10px 10px 0 0;padding:7px 16px;font-size:13px;color:#39424e;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tab.on{background:#fff;color:#151a23}
  .addr{margin:0 10px;background:#fff;border-radius:999px;padding:5px 16px;font-size:13px;color:#39424e;display:flex;justify-content:space-between}
  .icon{width:18px;height:18px;border-radius:5px;background:#006b5b;display:inline-block;vertical-align:middle;position:relative}
  .badge{position:absolute;right:-7px;bottom:-5px;background:#006b5b;color:#fff;border:2px solid #fff;border-radius:8px;font-size:10px;padding:0 4px;line-height:13px}
  #main{position:absolute;top:77px;left:0;width:1280px;height:723px;object-fit:cover;object-position:top}
  #popup{position:absolute;top:68px;right:14px;width:380px;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.28);opacity:0;transition:opacity .2s}
  #popup.on{opacity:1}
  #cap{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);background:rgba(21,26,35,.88);color:#fff;font-size:22px;padding:12px 22px;border-radius:14px;max-width:1100px;text-align:center}
  #chapter{position:absolute;inset:0;background:rgba(247,248,250,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#151a23;transition:opacity .4s}
  #chapter h1{font-size:44px;margin:0;letter-spacing:-.02em} #chapter p{font-size:20px;color:#586170;margin:0}
</style></head><body>
  <div class="chrome"><div class="tabs"><div class="tab on" id="t1">Contact support</div><div class="tab" id="t2" hidden>Review drafts | Form Rescue</div></div>
  <div class="addr"><span id="url"></span><span class="icon" title="Form Rescue"><span class="badge" id="badge" hidden></span></span></div></div>
  <img id="main" alt=""><img id="popup" alt=""><div id="cap"></div>
  <div id="chapter"><h1>Form Rescue</h1><p>Real extension · synthetic test page · test build</p></div>
</body></html>`);

const frames = new Map();
async function feed(page, key, width, height) {
  await page.screencast.start({ size: { width, height }, quality: 85, onFrame: ({ data }) => frames.set(key, `data:image/jpeg;base64,${data.toString("base64")}`) });
}
let mainKey = "site";
let showPopup = false;
let pushing = true;
const pusher = (async () => {
  while (pushing) {
    const main = frames.get(mainKey);
    const pop = frames.get("popup");
    await stage.evaluate(([m, p, on]) => {
      if (m && document.getElementById("main").src !== m) document.getElementById("main").src = m;
      if (p && document.getElementById("popup").src !== p) document.getElementById("popup").src = p;
      document.getElementById("popup").classList.toggle("on", on);
    }, [main, pop, showPopup]).catch(() => undefined);
    await sleep(60);
  }
})();
const caption = (text) => stage.evaluate((t) => (document.getElementById("cap").textContent = t), text);
const cues = [];
let t0 = 0;
const now = () => (Date.now() - t0) / 1000;
async function say(text) {
  if (cues.length) cues.at(-1).end = now();
  cues.push({ start: now(), end: now() + 30, text });
  await caption(text);
}
const setChrome = (url, tab2, badge) =>
  stage.evaluate(([u, t, b]) => {
    document.getElementById("url").textContent = u;
    document.getElementById("t2").hidden = !t;
    document.getElementById("t1").classList.toggle("on", !t);
    document.getElementById("t2").classList.toggle("on", !!t);
    document.getElementById("badge").hidden = !b;
    document.getElementById("badge").textContent = b ?? "";
  }, [url, tab2, badge]);

const site = await context.newPage();
await site.setViewportSize({ width: 1280, height: 723 });
await site.goto(`${A}/demo.html`);
await feed(site, "site", 1280, 723);
const popup = await context.newPage();
await popup.setViewportSize({ width: 380, height: 430 });
await popup.goto(ext(`popup/index.html?tab=${await tabId(`${A}/demo.html`)}`));
await feed(popup, "popup", 380, 430);
await setChrome("127.0.0.1:4173/demo.html", false, null);

const recordPath = path.join(REC, "recovery.webm");
await stage.screencast.start({ path: recordPath, size: { width: 1280, height: 800 } });
t0 = Date.now();
await say("A synthetic support form. Form Rescue isn't enabled here yet.");
await sleep(1800);
await stage.evaluate(() => (document.getElementById("chapter").style.opacity = "0"));
await sleep(1200);
showPopup = true;
await say("Enable protection for this site. It gets access to this one site only.");
await sleep(1500);
await popup.getByRole("button", { name: "Enable protection for this site" }).click();
await popup.getByText("Protection on", { exact: true }).waitFor();
await sleep(1600);
showPopup = false;
await say("Write as usual.");
await site.locator("#subject").pressSequentially(SUBJECT, { delay: 45 });
await site.locator("#details").pressSequentially(TEXT, { delay: 28 });
await sleep(700);
showPopup = true;
await say("About a second after a pause, the draft is committed to this browser.");
await popup.getByText(/Saved locally at/).waitFor({ timeout: 10_000 });
await sleep(2200);
showPopup = false;
await say("The page refreshes, and the text is gone.");
await site.reload();
await setChrome("127.0.0.1:4173/demo.html", false, "1");
await sleep(2400);
showPopup = true;
await say("Form Rescue has a saved draft for this page.");
await popup.getByText("1 saved draft for this page").waitFor();
await sleep(1600);
const recPromise = context.waitForEvent("page");
await popup.getByRole("button", { name: "Review drafts" }).click();
const rec = await recPromise;
await rec.setViewportSize({ width: 1280, height: 723 });
await rec.waitForLoadState();
await feed(rec, "rec", 1280, 723);
showPopup = false;
mainKey = "rec";
await setChrome(`Form Rescue · Review drafts`, true, "1");
await say("Review drafts opens a page the website can't see.");
await sleep(1500);
await rec.getByRole("button", { name: "Review this draft" }).click();
await rec.getByText("Restoring makes these values available to this website.").waitFor();
await say("Compare what was saved with what's on the page, and choose what to restore.");
await sleep(2600);
await rec.getByRole("button", { name: "Restore selected fields" }).click();
await rec.getByText(/Restored 2/).waitFor();
await say("Nothing is restored until you confirm.");
await sleep(2000);
mainKey = "site";
await setChrome("127.0.0.1:4173/demo.html", false, null);
await say("Your words are back.");
await sleep(2600);
cues.at(-1).end = now();
await stage.screencast.stop();
pushing = false;
await pusher;

// Poster and captions.
await stage.evaluate(() => {
  document.getElementById("cap").textContent = "Your words are back.";
});
await stage.screenshot({ path: path.join(REC, "recovery-poster.jpg"), type: "jpeg", quality: 82 });
const vtt = (s) => new Date(s * 1000).toISOString().slice(11, 23);
await writeFile(path.join(REC, "recovery.vtt"), `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${vtt(c.start)} --> ${vtt(c.end)}\n${c.text}\n`).join("\n")}`);
console.log(`Recording: ${cues.at(-1).end.toFixed(1)} s`);

// ---------------------------------------------------------------- screenshots (real UI, synthetic data)
async function shot(page, file, opts = {}) {
  await page.screenshot({ path: path.join(SHOTS, file), type: "jpeg", quality: 85, ...opts });
}
// Recovery review (plan state) on a fresh reload.
await site.reload();
const rec2 = await context.newPage();
await rec2.setViewportSize({ width: 1200, height: 900 });
await rec2.goto(ext(`pages/recovery/index.html?tab=${await tabId(`${A}/demo.html`)}`));
await rec2.getByRole("button", { name: "Review this draft" }).click();
await rec2.getByText("Restoring makes these values available to this website.").waitFor();
await shot(rec2, "recovery-review.jpg");
await rec2.getByRole("button", { name: "Restore selected fields" }).click();
await rec2.getByText(/Restored 2/).waitFor();
await rec2.evaluate(() => document.querySelector("[role=status][tabindex]")?.scrollIntoView({ block: "center" }));
await shot(rec2, "restored-full.jpg");

// Popup states at 2x for crisp small images.
async function popupShot(url, file, ready) {
  const p = await context.newPage({ deviceScaleFactor: 2 });
  await p.setViewportSize({ width: 380, height: 320 });
  await p.goto(url);
  await ready(p);
  await shot(p, file);
  return p;
}
const other = await context.newPage();
await other.goto(`http://localhost:4173/demo.html`);
await popupShot(ext(`popup/index.html?tab=${await tabId("http://localhost:4173/demo.html")}`), "popup-enable.jpg", (p) => p.getByText("Not enabled").waitFor());
await site.locator("#details").pressSequentially(" Screenshot.", { delay: 5 });
await popupShot(ext(`popup/index.html?tab=${await tabId(`${A}/demo.html`)}`), "popup-saved.jpg", (p) => p.getByText(/Saved locally at/).waitFor({ timeout: 10_000 }));
// Result card: the real review page at popup-like size, after a real restore.
await site.reload();
const card = await context.newPage({ deviceScaleFactor: 2 });
await card.setViewportSize({ width: 380, height: 320 });
await card.goto(ext(`pages/recovery/index.html?tab=${await tabId(`${A}/demo.html`)}`));
await card.getByRole("button", { name: "Review this draft" }).click();
await card.getByRole("button", { name: "Restore selected fields" }).click();
await card.getByText(/Restored [1-9]/).waitFor();
await card.evaluate(() => document.querySelector(".notice-ok")?.scrollIntoView({ block: "start" }));
await shot(card, "restored.jpg");

for (const [page, file] of [
  ["pages/library/index.html", "library.jpg"],
  ["pages/options/index.html", "settings.jpg"],
  ["pages/onboarding/index.html", "onboarding.jpg"],
]) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 1200, height: 900 });
  await p.goto(ext(page));
  if (file === "library.jpg") {
    await p.getByRole("button", { name: "Show values" }).first().click();
  }
  await sleep(300);
  await shot(p, file);
}

await context.close();
stopServers();
await rm(profile, { recursive: true, force: true }).catch(() => undefined);

// Publish copies for the website.
for (const f of ["recovery-review.jpg", "popup-enable.jpg", "popup-saved.jpg", "restored.jpg", "library.jpg", "settings.jpg"]) await copyFile(path.join(SHOTS, f), path.join(SITE_IMG, f));
for (const f of ["recovery.webm", "recovery-poster.jpg", "recovery.vtt"]) await copyFile(path.join(REC, f), path.join(SITE_DEMO, f));
console.log("Captured screenshots and recording.");
