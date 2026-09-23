import type { BrowserContext, Page, Worker } from "@playwright/test";
import { A, draftCount, dumpDb, enableSite, expect, openPopup, openRecovery, tabIdFor, test, waitSaved } from "./harness.js";

async function typeAtEnd(page: Page, selector: string, text: string) {
  await page.locator(selector).focus();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

async function review(context: BrowserContext, extId: string, sw: Worker, page: Page) {
  const rec = await openRecovery(context, extId, await tabIdFor(sw, page));
  await rec.getByRole("button", { name: "Review this draft" }).click();
  await expect(rec.getByText("Restoring makes these values available to this website.")).toBeVisible();
  return rec;
}

test("closed tab: reopen the URL manually and recover", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially("Written before the tab closed.", { delay: 2 });
  await (await waitSaved(context, sw, extId, page)).close();
  await page.close();
  const again = await context.newPage();
  await again.goto(`${A}/demo.html`);
  const rec = await review(context, extId, sw, again);
  await rec.getByRole("button", { name: "Restore selected fields" }).click();
  await expect(again.locator("#details")).toHaveValue("Written before the tab closed.");
});

test("two tabs on the same form keep separate drafts that are never merged", async ({ context, sw, extId }) => {
  const one = await context.newPage();
  await one.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, one);
  const two = await context.newPage();
  await two.goto(`${A}/demo.html`);
  await one.locator("#details").pressSequentially("Tab one text", { delay: 2 });
  await one.locator("#subject").click();
  await two.locator("#details").pressSequentially("Tab two text", { delay: 2 });
  await two.locator("#subject").click();
  await expect.poll(() => draftCount(sw), { timeout: 8000 }).toBe(2);
  const third = await context.newPage();
  await third.goto(`${A}/demo.html`);
  const rec = await openRecovery(context, extId, await tabIdFor(sw, third));
  await expect(rec.getByRole("radio")).toHaveCount(2);
  const db = await dumpDb(sw);
  expect(db).not.toContain("Tab one textTab two text");
});

test("back/forward cache: no duplicate listeners, no accidental overwrite", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially("Before navigating away.", { delay: 2 });
  await (await waitSaved(context, sw, extId, page)).close();
  await page.goto(`${A}/index.html`);
  await page.goBack();
  await typeAtEnd(page, "#details", " After coming back.");
  await page.locator("#subject").click();
  await expect.poll(async () => (await dumpDb(sw)).includes("After coming back."), { timeout: 8000 }).toBe(true);
  const revisions = JSON.parse(await dumpDb(sw)).revisions as { fields: { value: { text?: string } }[] }[];
  for (const r of revisions) for (const f of r.fields) expect(f.value.text ?? "").not.toMatch(/After coming back\..*After coming back\./);
});

test("SPA route changes create separate scopes; a stale plan is blocked after navigation", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/spa/start`);
  await enableSite(context, sw, extId, page);
  await page.locator("#body").pressSequentially("Start route text", { delay: 2 });
  await page.locator("#title").click();
  await page.locator("#to-other").click();
  await page.locator("#body").pressSequentially("Other route text", { delay: 2 });
  await page.locator("#title").click();
  await expect.poll(() => draftCount(sw), { timeout: 8000 }).toBe(2);
  const routes = new Set((JSON.parse(await dumpDb(sw)).drafts as { routeHash: string }[]).map((d) => d.routeHash));
  expect(routes.size).toBe(2);

  await page.reload(); // now at /spa/other?tab=2
  const rec = await review(context, extId, sw, page);
  await expect(rec.getByText("Other route text")).toBeVisible();
  await expect(rec.getByText("Start route text")).toHaveCount(0);
  // Navigate within the SPA after reviewing: the plan is now stale.
  await page.locator("#to-start").click();
  await rec.getByRole("button", { name: "Restore selected fields" }).click();
  await expect(rec.getByRole("alert")).toContainText("The page changed since you opened this review. Nothing was restored.");
  await expect(page.locator("#body")).toHaveValue("");
});

test("session expiry: sign in again, return, recover only the prose — credentials never stored", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/session/form`); // redirected to login first
  await page.locator("#u").fill("synthetic-user");
  await page.locator("#p").fill("synthetic-pass-9d1c");
  await page.locator("#signin-btn").click();
  await expect(page).toHaveURL(`${A}/session/form`);
  await enableSite(context, sw, extId, page);
  await page.locator("#essay").pressSequentially("I enjoy careful, patient work.", { delay: 2 });
  await (await waitSaved(context, sw, extId, page)).close();
  // Session expires.
  await page.locator("#logout").click();
  await page.locator("#u").pressSequentially("synthetic-user", { delay: 2 });
  await page.locator("#p").pressSequentially("synthetic-pass-9d1c", { delay: 2 });
  await page.locator("#signin-btn").click();
  await expect(page).toHaveURL(`${A}/session/form`);
  const rec = await review(context, extId, sw, page);
  await rec.getByRole("button", { name: "Restore selected fields" }).click();
  await expect(page.locator("#essay")).toHaveValue("I enjoy careful, patient work.");
  const db = await dumpDb(sw);
  expect(db).not.toContain("synthetic-pass");
  expect(db).not.toContain("synthetic-user");
});

test("same URL with a different account query never offers the other account's draft", async ({ context, sw, extId }) => {
  const a = await context.newPage();
  await a.goto(`${A}/demo.html?account=alpha`);
  await enableSite(context, sw, extId, a);
  await a.locator("#details").pressSequentially("Alpha account draft", { delay: 2 });
  await (await waitSaved(context, sw, extId, a)).close();
  const b = await context.newPage();
  await b.goto(`${A}/demo.html?account=beta`);
  const popup = await openPopup(context, extId, await tabIdFor(sw, b));
  await expect(popup.getByText("No saved drafts for this page")).toBeVisible();
});

test("React- and Vue-controlled inputs accept restored values into framework state", async ({ context, sw, extId }) => {
  for (const [path, field, mirror] of [
    ["/react.html", "#rtext", "#react-mirror"],
    ["/vue.html", "#vnote", "#vue-mirror"],
  ] as const) {
    const page = await context.newPage();
    await page.goto(`${A}${path}`);
    if (path === "/react.html") await enableSite(context, sw, extId, page);
    await page.locator(field).pressSequentially(`Framework text ${path}`, { delay: 2 });
    await (await waitSaved(context, sw, extId, page)).close();
    await page.reload();
    await expect(page.locator(mirror)).toHaveText("");
    const rec = await review(context, extId, sw, page);
    await rec.getByRole("button", { name: "Restore selected fields" }).click();
    await expect(rec.getByText(/Restored 1/)).toBeVisible();
    await expect(page.locator(mirror)).toHaveText(`Framework text ${path}`);
  }
});

test("framework that rejects the restored value is reported as failed with copy fallback", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/rerender.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#rr-text").pressSequentially("Rerender me", { delay: 2 });
  await (await waitSaved(context, sw, extId, page)).close();
  await page.reload();
  const rec = await review(context, extId, sw, page);
  await rec.getByRole("button", { name: "Restore selected fields" }).click();
  await expect(rec.getByText(/failed 1/)).toBeVisible();
  await expect(page.locator("#rr-text")).toHaveValue("");
});

test("open shadow roots and fields outside forms are captured and restored", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/shadow.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#c").pressSequentially("Shadow comment", { delay: 2 });
  await page.locator("#t").pressSequentially("Shadow headline", { delay: 2 });
  await (await waitSaved(context, sw, extId, page)).close();
  await page.reload();
  const rec = await review(context, extId, sw, page);
  await rec.getByRole("button", { name: "Restore selected fields" }).click();
  await expect(page.locator("#c")).toHaveValue("Shadow comment");

  const v = await context.newPage();
  await v.goto(`${A}/virtual.html`);
  await v.locator("#fb").pressSequentially("Feedback text", { delay: 2 });
  await v.locator("#loose").pressSequentially("Loose text", { delay: 2 });
  await v.locator("#fb").click();
  // Independently edited controls outside forms become separate small groups, not one page-wide draft.
  await expect.poll(async () => (JSON.parse(await dumpDb(sw)).drafts as { routeHash: string }[]).length, { timeout: 8000 }).toBe(3);
});

test("repeated identical fields are copy-only, never guessed", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/repeated.html`);
  await enableSite(context, sw, extId, page);
  const answers = page.locator("textarea[name=answer]");
  await answers.nth(0).pressSequentially("First answer", { delay: 2 });
  await answers.nth(1).pressSequentially("Second answer", { delay: 2 });
  await (await waitSaved(context, sw, extId, page)).close();
  await page.reload();
  const rec = await review(context, extId, sw, page);
  await expect(rec.getByText(/Copy only/)).toHaveCount(2);
  await expect(rec.getByRole("button", { name: "Restore selected fields" })).toBeDisabled();
  await expect(rec.getByRole("button", { name: /Copy Text field/ })).toHaveCount(2);
});

test("text the browser restored by itself is left alone unless replacement is chosen", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/autofill.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#summary").pressSequentially("My own summary", { delay: 2 });
  await (await waitSaved(context, sw, extId, page)).close();
  await page.evaluate(() => sessionStorage.setItem("prefill", "1"));
  await page.reload();
  await expect(page.locator("#summary")).toHaveValue("Text the browser restored by itself.");
  const rec = await review(context, extId, sw, page);
  await expect(rec.getByRole("checkbox", { name: "Replace what's on the page" })).not.toBeChecked();
  await expect(rec.getByRole("button", { name: "Restore selected fields" })).toBeDisabled();
});

test("submission attempt keeps the draft and labels it", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially("Submitted text", { delay: 2 });
  await (await waitSaved(context, sw, extId, page)).close();
  await page.locator("button[type=submit]").click();
  await page.waitForLoadState();
  await expect.poll(async () => (await dumpDb(sw)).includes("submission-attempted"), { timeout: 8000 }).toBe(true);
  const lib = await context.newPage();
  await lib.goto(`chrome-extension://${extId}/pages/library/index.html`);
  await expect(lib.getByText(/Submission attempted/)).toBeVisible();
});

test("permission revoked in browser settings: capture stops, drafts purged, script unregistered", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially("Before revocation", { delay: 2 });
  await (await waitSaved(context, sw, extId, page)).close();
  const tabId = await tabIdFor(sw, page);
  // The user withholds site access from chrome://extensions.
  const ext = await context.newPage();
  await ext.goto("chrome://extensions");
  await ext.evaluate(async (id) => {
    await (chrome as unknown as { developerPrivate: { updateExtensionConfiguration(c: object): Promise<void> } }).developerPrivate.updateExtensionConfiguration({ extensionId: id, hostAccess: "ON_CLICK" });
  }, extId);
  await expect.poll(() => draftCount(sw), { timeout: 8000 }).toBe(0);
  expect(await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts())).toHaveLength(0);
  await typeAtEnd(page, "#details", " after revocation");
  await page.locator("#subject").click();
  await page.waitForTimeout(1800);
  expect(await draftCount(sw)).toBe(0);
  const popup = await openPopup(context, extId, tabId);
  await expect(popup.getByText("Protection on")).toHaveCount(0);
});

test("delete during queued save: buffered text never resurrects", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially("First save", { delay: 2 });
  await (await waitSaved(context, sw, extId, page)).close();
  const ui = await context.newPage();
  await ui.goto(`chrome-extension://${extId}/pages/options/index.html`);
  await typeAtEnd(page, "#details", " QUEUED-TEXT");
  // Delete everything while the edit is still inside the debounce window.
  expect(await ui.evaluate(() => chrome.runtime.sendMessage({ type: "deleteAll" }))).toEqual({ ok: true, remaining: 0 });
  await page.waitForTimeout(2000);
  expect(await dumpDb(sw)).not.toContain("QUEUED-TEXT");
  expect(await draftCount(sw)).toBe(0);
});

test("global pause stops capture; settings retention and delete-all verify an empty library", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially("Kept draft", { delay: 2 });
  await (await waitSaved(context, sw, extId, page)).close();
  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extId}/pages/options/index.html`);
  await opts.getByRole("checkbox", { name: "Pause saving on all sites" }).check();
  await typeAtEnd(page, "#details", " while paused");
  await page.locator("#subject").click();
  await page.waitForTimeout(1800);
  expect(await dumpDb(sw)).not.toContain("while paused");
  expect(await dumpDb(sw)).toContain("Kept draft");
  await opts.getByLabel("Keep drafts for").selectOption("1");
  await expect(opts.getByLabel("Keep drafts for")).toHaveValue("1");
  await opts.getByRole("button", { name: "Delete all drafts" }).click();
  const dialog = opts.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Delete 1 draft permanently?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete all drafts" }).click();
  await expect(opts.getByText("All drafts deleted. The library is empty.")).toBeVisible();
  expect(await draftCount(sw)).toBe(0);
});

test("disable site: default deletes drafts; keep-drafts option preserves them", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially("Disable me", { delay: 2 });
  const popup = await waitSaved(context, sw, extId, page);
  await popup.getByRole("button", { name: "Disable this site" }).click();
  const dialog = popup.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Disable and delete drafts" })).toBeFocused();
  await dialog.getByRole("button", { name: "Disable and keep drafts" }).click();
  await expect(popup.getByText("Not enabled")).toBeVisible();
  expect(await draftCount(sw)).toBe(1);
  await typeAtEnd(page, "#details", " after disable");
  await page.locator("#subject").click();
  await page.waitForTimeout(1800);
  expect(await dumpDb(sw)).not.toContain("after disable");
});
