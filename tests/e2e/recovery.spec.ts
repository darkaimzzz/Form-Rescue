import { A, B, draftCount, dumpDb, enableSite, expect, openPopup, openRecovery, tabIdFor, test, waitSaved } from "./harness.js";

const TEXT = "Synthetic draft: the export button spins forever after I pick CSV.";

test("disabled sites are untouched: no script, no drafts", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await page.locator("#details").fill(TEXT);
  await page.waitForTimeout(1500);
  expect(await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts())).toHaveLength(0);
  expect(await draftCount(sw)).toBe(0);
  const popup = await openPopup(context, extId, await tabIdFor(sw, page));
  await expect(popup.getByText("Not enabled")).toBeVisible();
});

test("refresh after durable save → review → restore exact text", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially(TEXT, { delay: 5 });
  await page.locator("#subject").pressSequentially("Export stuck", { delay: 5 });
  await waitSaved(context, sw, extId, page);

  await page.reload();
  await expect(page.locator("#details")).toHaveValue("");
  const popup = await openPopup(context, extId, await tabIdFor(sw, page));
  await expect(popup.getByText("1 saved draft for this page")).toBeVisible();

  const rec = await openRecovery(context, extId, await tabIdFor(sw, page));
  await rec.getByRole("button", { name: "Review this draft" }).click();
  await expect(rec.getByText("Restoring makes these values available to this website.")).toBeVisible();
  // Nothing is sent to the page before confirmation.
  await expect(page.locator("#details")).toHaveValue("");
  // Empty targets with confident matches start selected.
  const boxes = rec.getByRole("checkbox", { name: /Restore Text field/ });
  await expect(boxes).toHaveCount(2);
  for (const b of await boxes.all()) await expect(b).toBeChecked();
  await rec.getByRole("button", { name: "Restore selected fields" }).click();
  await expect(rec.getByText(/Restored 2, skipped 0, conflicted 0, unsupported 0, failed 0/)).toBeVisible();
  await expect(page.locator("#details")).toHaveValue(TEXT);
  await expect(page.locator("#subject")).toHaveValue("Export stuck");
});

test("undo restores only fields not edited afterwards", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially(TEXT, { delay: 2 });
  await page.locator("#subject").pressSequentially("Undo me", { delay: 2 });
  await waitSaved(context, sw, extId, page);
  await page.reload();
  const rec = await openRecovery(context, extId, await tabIdFor(sw, page));
  await rec.getByRole("button", { name: "Review this draft" }).click();
  await rec.getByRole("button", { name: "Restore selected fields" }).click();
  await expect(rec.getByText(/Restored 2/)).toBeVisible();
  await page.locator("#subject").focus();
  await page.keyboard.press("End");
  await page.keyboard.type(" plus my edit");
  await rec.getByRole("button", { name: "Undo this restore" }).click();
  await expect(rec.getByText("Undo finished: 1 reverted, 1 kept because you edited them afterwards.")).toBeVisible();
  await expect(page.locator("#details")).toHaveValue("");
  await expect(page.locator("#subject")).toHaveValue("Undo me plus my edit");
});

test("populated fields require explicit replacement; nothing overwritten silently", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially(TEXT, { delay: 2 });
  await waitSaved(context, sw, extId, page);
  await page.reload();
  await page.locator("#details").fill("Newer text typed after reload");
  const rec = await openRecovery(context, extId, await tabIdFor(sw, page));
  await rec.getByRole("button", { name: "Review this draft" }).click();
  const replace = rec.getByRole("checkbox", { name: "Replace what's on the page" });
  await expect(replace).not.toBeChecked();
  await expect(rec.getByRole("button", { name: "Restore selected fields" })).toBeDisabled();
  await expect(page.locator("#details")).toHaveValue("Newer text typed after reload");
  // Opt in, but the page changes again before confirming: conflict, left alone.
  await replace.check();
  await page.locator("#details").fill("Changed after review");
  await rec.getByRole("button", { name: "Restore selected fields" }).click();
  await expect(rec.getByText(/conflicted 1/)).toBeVisible();
  await expect(page.locator("#details")).toHaveValue("Changed after review");
});

test("select, checkbox and radio values restore only when chosen", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  // Real keyboard selection: Playwright's selectOption() dispatches untrusted events, which capture ignores by design.
  await page.locator("#topic").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.locator("#urgent").check();
  await page.locator("#r-call").check();
  await waitSaved(context, sw, extId, page);
  await page.reload();
  const rec = await openRecovery(context, extId, await tabIdFor(sw, page));
  await rec.getByRole("button", { name: "Review this draft" }).click();
  const boxes = rec.getByRole("checkbox", { name: /Restore/ });
  await expect(boxes).toHaveCount(3);
  for (const b of await boxes.all()) await expect(b).not.toBeChecked();
  for (const b of await boxes.all()) await b.check();
  await rec.getByRole("button", { name: "Restore selected fields" }).click();
  await expect(rec.getByText(/Restored 3/)).toBeVisible();
  await expect(page.locator("#topic")).toHaveValue("bug");
  await expect(page.locator("#urgent")).toBeChecked();
  await expect(page.locator("#r-call")).toBeChecked();
});

test("cross-origin drafts never appear as candidates", async ({ context, sw, extId }) => {
  const a = await context.newPage();
  await a.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, a);
  await a.locator("#details").pressSequentially(TEXT, { delay: 2 });
  await waitSaved(context, sw, extId, a);
  const b = await context.newPage();
  await b.goto(`${B}/demo.html`);
  await enableSite(context, sw, extId, b);
  const popup = await openPopup(context, extId, await tabIdFor(sw, b));
  await expect(popup.getByText("No saved drafts for this page")).toBeVisible();
  const rec = await openRecovery(context, extId, await tabIdFor(sw, b));
  await expect(rec.getByText(/No saved drafts match this page/)).toBeVisible();
  expect(await dumpDb(sw)).toContain("127.0.0.1:4173");
});
