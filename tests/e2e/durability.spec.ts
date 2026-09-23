import type { BrowserContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { A, closeAll, stopWorker, draftCount, dumpDb, enableSite, expect, launch, openRecovery, tabIdFor, test, waitSaved, worker } from "./harness.js";

const FIRST = "Committed paragraph one.";

async function restoreAll(context: BrowserContext, extId: string, tabId: number) {
  const rec = await openRecovery(context, extId, tabId);
  await rec.getByRole("button", { name: "Review this draft" }).click();
  await rec.getByRole("button", { name: "Restore selected fields" }).click();
  await expect(rec.getByText(/Restored [1-9]/)).toBeVisible();
  return rec;
}

test("service worker termination loses no acknowledged data; capture resumes with a fresh capability", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially(FIRST, { delay: 2 });
  await (await waitSaved(context, sw, extId, page)).close();

  // Stop the extension service worker (as the browser does for idle workers).
  await stopWorker(context, extId);

  await page.locator("#details").focus();
  await page.keyboard.press("End");
  await page.keyboard.type(" And a second one.");
  await page.locator("#subject").click(); // blur → flush wakes the worker
  const sw2 = await worker(context);
  await expect.poll(async () => (await dumpDb(sw2)).includes(`${FIRST} And a second one.`), { timeout: 10_000 }).toBe(true);
  expect(await draftCount(sw2)).toBe(1);
});

test("full browser restart with the same profile keeps committed drafts", async ({ context, sw, extId, profileDir }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially(FIRST, { delay: 2 });
  await waitSaved(context, sw, extId, page);
  await closeAll(context);

  const again = await launch(profileDir);
  try {
    const sw2 = await worker(again);
    // Startup reconciliation registers the script asynchronously; pages loaded earlier need a reload (as for users).
    await expect.poll(async () => (await sw2.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length).toBe(1);
    const p2 = await again.newPage();
    await p2.goto(`${A}/demo.html`);
    await restoreAll(again, extId, await tabIdFor(sw2, p2));
    await expect(p2.locator("#details")).toHaveValue(FIRST);
  } finally {
    await closeAll(again);
  }
});

/** Crash harness: hard-kill every browser process using this profile (no clean shutdown, no unload handlers). */
function killBrowser(profileDir: string): void {
  if (process.platform === "win32") {
    const needle = path.basename(profileDir);
    execFileSync("powershell", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${needle}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]);
  } else {
    execFileSync("pkill", ["-9", "-f", profileDir]);
  }
}

test("force-killed browser after an acknowledged save recovers that commit; unsaved tail is not promised", async ({ profileDir }) => {
  // Install and shut down cleanly first: a kill seconds after a first-ever install loses Chrome's install
  // record, and Chrome then garbage-collects that extension's storage (a harness artifact, see docs/testing.md).
  await closeAll(await launch(profileDir));
  const context = await launch(profileDir);
  const sw = await worker(context);
  const extId = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially(FIRST, { delay: 2 });
  await waitSaved(context, sw, extId, page);
  // Type more and kill immediately, before the debounce can commit it.
  await page.locator("#details").pressSequentially(" UNSAVED-TAIL", { delay: 1 });
  killBrowser(profileDir);
  await new Promise((r) => setTimeout(r, 1500));

  const again = await launch(profileDir);
  try {
    const sw2 = await worker(again);
    // Startup reconciliation registers the script asynchronously; pages loaded earlier need a reload (as for users).
    await expect.poll(async () => (await sw2.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length).toBe(1);
    const p2 = await again.newPage();
    await p2.goto(`${A}/demo.html`);
    await restoreAll(again, extId, await tabIdFor(sw2, p2));
    const value = await p2.locator("#details").inputValue();
    expect(value.startsWith(FIRST)).toBe(true); // the acknowledged commit is intact
  } finally {
    await closeAll(again);
  }
});
