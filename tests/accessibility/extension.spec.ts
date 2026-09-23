import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { A, enableSite, expect, openPopup, openRecovery, tabIdFor, test, waitSaved } from "../e2e/harness.js";

/** axe (WCAG 2.2 A/AA rules) plus reflow at 320 CSS px. Automated checks are necessary, not sufficient (see docs/accessibility.md). */
async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const violations = results.violations.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.help}`);
  expect(violations).toEqual([]);
}

// Bidi override characters built from code points so the source itself contains none.
const RLO = String.fromCharCode(0x202e);
const PDF = String.fromCharCode(0x202c);

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("extension pages pass axe in every main state, reflow at 320 px, and support keyboard use", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  const tabId = await tabIdFor(sw, page);

  // Popup: not enabled.
  const popup = await openPopup(context, extId, tabId);
  await expect(popup.getByText("Not enabled")).toBeVisible();
  await audit(popup, "popup/not-enabled");
  // Keyboard: the primary action is reachable by Tab and operable by Enter.
  await popup.keyboard.press("Tab");
  await expect(popup.getByRole("button", { name: "Enable protection for this site" })).toBeFocused();
  await popup.close();

  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially(`Accessible synthetic text ${RLO}reversed${PDF} and a very_long_unbroken_string_` + "x".repeat(200), { delay: 1 });
  const saved = await waitSaved(context, sw, extId, page);
  await audit(saved, "popup/saved");

  // Disable dialog: focus moves in, Escape closes, focus returns to the opener.
  const opener = saved.getByRole("button", { name: "Disable this site" });
  await opener.focus();
  await saved.keyboard.press("Enter");
  await expect(saved.getByRole("dialog")).toBeVisible();
  await audit(saved, "popup/disable-dialog");
  await saved.keyboard.press("Escape");
  await expect(saved.getByRole("dialog")).toBeHidden();
  await expect(opener).toBeFocused();
  await saved.close();

  await page.reload();
  const rec = await openRecovery(context, extId, await tabIdFor(sw, page));
  await expect(rec.getByRole("button", { name: "Review this draft" })).toBeVisible();
  await audit(rec, "recovery/choose");
  await rec.getByRole("button", { name: "Review this draft" }).click();
  await expect(rec.getByText("Restoring makes these values available to this website.")).toBeVisible();
  // Bidi override characters are shown as visible markers, never applied.
  await expect(rec.getByText(/⟦U\+202E⟧reversed⟦U\+202C⟧/)).toBeVisible();
  await audit(rec, "recovery/plan");
  await rec.bringToFront();
  await rec.getByRole("button", { name: "Restore selected fields" }).click();
  // Focus moves to the result summary (checked via activeElement: background headless tabs report "inactive").
  await expect(rec.getByRole("status").filter({ hasText: /Restored 1/ })).toBeVisible();
  expect(await rec.evaluate(() => document.activeElement?.textContent ?? "")).toMatch(/^Restored 1/);
  await audit(rec, "recovery/result");
  await rec.setViewportSize({ width: 320, height: 800 });
  await noHorizontalScroll(rec);

  const lib = await context.newPage();
  await lib.goto(`chrome-extension://${extId}/pages/library/index.html`);
  await lib.getByRole("button", { name: "Show values" }).click();
  await audit(lib, "library/expanded");
  await lib.setViewportSize({ width: 320, height: 800 });
  await noHorizontalScroll(lib);

  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extId}/pages/options/index.html`);
  await audit(opts, "options");
  await opts.getByRole("button", { name: "Show diagnostic summary" }).click();
  const diag = await opts.locator("pre").innerText();
  expect(diag).not.toMatch(/127\.0\.0\.1|localhost|Accessible synthetic/);
  await opts.getByRole("button", { name: "Delete all drafts" }).click();
  await audit(opts, "options/delete-dialog");
  await opts.keyboard.press("Escape");
  await opts.setViewportSize({ width: 320, height: 800 });
  await noHorizontalScroll(opts);

  const onb = await context.newPage();
  await onb.goto(`chrome-extension://${extId}/pages/onboarding/index.html`);
  await audit(onb, "onboarding");
  await onb.setViewportSize({ width: 320, height: 800 });
  await noHorizontalScroll(onb);

  // Reduced motion + dark scheme + forced colors render without violations.
  for (const media of [{ reducedMotion: "reduce" as const, colorScheme: "dark" as const }, { forcedColors: "active" as const }]) {
    await onb.emulateMedia(media);
    await audit(onb, `onboarding/${JSON.stringify(media)}`);
  }
});
