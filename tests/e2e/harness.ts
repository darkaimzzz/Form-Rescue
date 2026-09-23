/**
 * Real-extension test harness: launches Playwright's Chromium with the
 * unpacked E2E build (apps/extension/dist-e2e/chrome) in a persistent profile.
 * The E2E build pre-grants the local fixture hosts because automation cannot
 * click the browser's own permission prompt; the in-product enable flow
 * (popup click → permissions.request → enableSite) still runs. See docs/testing.md.
 */
import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Lets Playwright report requests made by the extension service worker.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

export const EXT_PATH = path.resolve("apps/extension/dist-e2e/chrome");
export const A = "http://127.0.0.1:4173";
export const B = "http://localhost:4173";
export const A2 = "http://127.0.0.1:4174";

export async function launch(userDataDir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: !process.env.HEADED,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
}

/** Close pages one by one first; closing a persistent context with extension pages open can hang. */
export async function closeAll(context: BrowserContext): Promise<void> {
  for (const pg of context.pages()) await pg.close({ runBeforeUnload: false }).catch(() => undefined);
  await context.close().catch(() => undefined);
}

/** The Form Rescue background worker (ignores built-in component extension workers). */
export async function worker(context: BrowserContext): Promise<Worker> {
  const ours = (w: Worker) => w.url().endsWith("/background.js");
  return context.serviceWorkers().find(ours) ?? (await context.waitForEvent("serviceworker", { predicate: ours }));
}

/** Stops the extension service worker the way the browser does for idle workers. */
export async function stopWorker(context: BrowserContext, extId: string): Promise<void> {
  const si = await context.newPage();
  await si.goto("chrome://serviceworker-internals/");
  const reg = si.locator(".serviceworker-registration").filter({ hasText: `chrome-extension://${extId}/` });
  await reg.getByText("Stop", { exact: true }).first().click();
  await expect(reg.getByText("Running Status: STOPPED").first()).toBeVisible();
  await si.close();
}

type Fixtures = { profileDir: string; context: BrowserContext; sw: Worker; extId: string };

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  profileDir: async ({}, use) => {
    const dir = await mkdtemp(path.join(tmpdir(), "fr-e2e-"));
    await use(dir);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  },
  context: async ({ profileDir }, use) => {
    const context = await launch(profileDir);
    await use(context);
    await closeAll(context);
  },
  sw: async ({ context }, use) => use(await worker(context)),
  extId: async ({ sw }, use) => use(new URL(sw.url()).host),
});
export { expect };

export async function tabIdFor(sw: Worker, page: Page): Promise<number> {
  const url = page.url();
  for (let i = 0; i < 50; i++) {
    const id = await sw.evaluate(async (u) => (await chrome.tabs.query({})).filter((t) => t.url === u).at(-1)?.id, url);
    if (id !== undefined) return id;
    await page.waitForTimeout(100);
  }
  throw new Error(`No tab for ${url}`);
}

export async function openPopup(context: BrowserContext, extId: string, tabId: number): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup/index.html?tab=${tabId}`);
  return popup;
}

/** Enables protection through the real popup UI (click → permissions.request → enableSite). */
export async function enableSite(context: BrowserContext, sw: Worker, extId: string, page: Page): Promise<void> {
  const popup = await openPopup(context, extId, await tabIdFor(sw, page));
  await popup.getByRole("button", { name: "Enable protection for this site" }).click();
  await expect(popup.getByText("Protection on", { exact: true })).toBeVisible();
  await popup.close();
}

/** Waits for the page's popup status to report a durable save. */
export async function waitSaved(context: BrowserContext, sw: Worker, extId: string, page: Page): Promise<Page> {
  const popup = await openPopup(context, extId, await tabIdFor(sw, page));
  await expect(popup.getByText(/Saved locally at/)).toBeVisible({ timeout: 10_000 });
  return popup;
}

/** Full dump of every extension IndexedDB store, for sentinel checks. */
export async function dumpDb(sw: Worker): Promise<string> {
  return sw.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open("form-rescue");
        req.onerror = () => reject(req.error);
        req.onsuccess = async () => {
          const db = req.result;
          const out: Record<string, unknown[]> = {};
          for (const name of Array.from(db.objectStoreNames)) {
            out[name] = await new Promise((res) => {
              const r = db.transaction(name).objectStore(name).getAll();
              r.onsuccess = () => res(r.result);
            });
          }
          db.close();
          resolve(JSON.stringify(out));
        };
      }),
  );
}

export async function draftCount(sw: Worker): Promise<number> {
  return JSON.parse(await dumpDb(sw)).drafts.length;
}

/** Opens the recovery view for a tab and restores after selecting the given checkboxes. */
export async function openRecovery(context: BrowserContext, extId: string, tabId: number): Promise<Page> {
  const rec = await context.newPage();
  await rec.goto(`chrome-extension://${extId}/pages/recovery/index.html?tab=${tabId}`);
  return rec;
}
