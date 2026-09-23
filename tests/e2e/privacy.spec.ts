import type { Request } from "@playwright/test";
import { A, draftCount, dumpDb, enableSite, expect, openPopup, openRecovery, tabIdFor, test, waitSaved } from "./harness.js";

const SENTINEL = "SENTINEL-SECRET-7f3a";

// Value-read instrumentation lives in tests/unit/content-dom.test.ts: page-world getters cannot observe isolated-world reads.
test("hard-excluded fields and forms are never stored; only the eligible bio is", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/sensitive.html`);
  await enableSite(context, sw, extId, page);
  for (const id of ["#otp-like", "#apikey", "#secret-notes", "#optout", "#acoff", "#mail"])
    await page.locator(id).pressSequentially(`${SENTINEL}${id}`, { delay: 1 });
  await page.locator("#bio").pressSequentially("I grow tomatoes.", { delay: 2 });
  await waitSaved(context, sw, extId, page);
  const db = await dumpDb(sw);
  expect(db).toContain("I grow tomatoes.");
  expect(db).not.toContain(SENTINEL);
});

for (const [path, fields] of [
  ["/login.html", ["#user", "#pw", "#note"]],
  ["/checkout.html", ["#cc", "#gift"]],
] as const) {
  test(`whole sensitive form ${path} is never stored`, async ({ context, sw, extId }) => {
    const page = await context.newPage();
    await page.goto(`${A}${path}`);
    await enableSite(context, sw, extId, page);
    for (const f of fields) await page.locator(f).pressSequentially(`${SENTINEL}${f}`, { delay: 1 });
    await page.locator(fields.at(-1)!).blur();
    await page.waitForTimeout(1800);
    expect(await dumpDb(sw)).not.toContain(SENTINEL);
    expect(await draftCount(sw)).toBe(0);
  });
}

test("credential-looking values are screened out and earlier revisions of that field are purged", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially("Ordinary prose first.", { delay: 2 });
  await page.locator("#subject").pressSequentially("Keep me", { delay: 2 });
  await waitSaved(context, sw, extId, page);
  expect(await dumpDb(sw)).toContain("Ordinary prose first.");
  // Public test card number (synthetic).
  await page.locator("#details").pressSequentially(" card 4111 1111 1111 1111", { delay: 1 });
  await page.locator("#details").blur();
  await expect.poll(async () => (await dumpDb(sw)).includes("Ordinary prose first."), { timeout: 8000 }).toBe(false);
  const db = await dumpDb(sw);
  expect(db).not.toContain("4111");
  expect(db).toContain("Keep me");
});

test("a field that becomes sensitive (password added to its form) is purged", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/dynamic.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#story").pressSequentially(`${SENTINEL} dynamic story`, { delay: 1 });
  await waitSaved(context, sw, extId, page);
  expect(await dumpDb(sw)).toContain(SENTINEL);
  await page.locator("#make-sensitive").click();
  await expect.poll(async () => (await dumpDb(sw)).includes(SENTINEL), { timeout: 8000 }).toBe(false);
});

test("iframes are never captured", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/frame.html`);
  await enableSite(context, sw, extId, page);
  await page.frameLocator("#f").locator("#details").pressSequentially(`${SENTINEL} in frame`, { delay: 1 });
  await page.frameLocator("#f").locator("#details").blur();
  await page.waitForTimeout(1800);
  expect(await dumpDb(sw)).not.toContain(SENTINEL);
});

test("search boxes are skipped until explicitly included; exclusions delete saved values", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#site-search").pressSequentially("query one", { delay: 2 });
  await page.locator("#details").pressSequentially(`${SENTINEL} details`, { delay: 1 });
  await waitSaved(context, sw, extId, page);
  let db = await dumpDb(sw);
  expect(db).not.toContain("query one");
  expect(db).toContain(SENTINEL);

  const rec = await openRecovery(context, extId, await tabIdFor(sw, page));
  await rec.getByRole("button", { name: "Manage fields on this page" }).click();
  await rec.getByRole("listitem").filter({ hasText: "Search help articles" }).getByRole("button", { name: "Save this search box" }).click();
  await expect(rec.getByText("Saving this search box")).toBeVisible();
  await rec.getByRole("listitem").filter({ hasText: "Describe what happened" }).getByRole("button", { name: "Exclude this field" }).click();
  await expect(rec.getByText("Excluded", { exact: true })).toBeVisible();
  await expect.poll(async () => (await dumpDb(sw)).includes(SENTINEL), { timeout: 5000 }).toBe(false);

  for (const [sel, text] of [
    ["#site-search", " two"],
    ["#details", " more"],
  ] as const) {
    await page.locator(sel).focus();
    await page.keyboard.press("End");
    await page.keyboard.type(text);
  }
  await page.locator("#details").blur();
  await expect.poll(async () => (await dumpDb(sw)).includes("query one two"), { timeout: 8000 }).toBe(true);
  db = await dumpDb(sw);
  expect(db).not.toContain(SENTINEL);
  expect(db).not.toContain("details more");
});

test("pages cannot reach the extension: no runtime API, postMessage ignored", async ({ context, sw, extId }) => {
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  expect(await page.evaluate(() => typeof (globalThis as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome?.runtime?.sendMessage)).toBe("undefined");
  await page.evaluate(() => window.postMessage({ type: "listDrafts" }, "*"));
  const res = await page.evaluate(async (id) => {
    try {
      const r = await fetch(`chrome-extension://${id}/pages/library/index.html`);
      return r.status;
    } catch {
      return "blocked";
    }
  }, extId);
  expect(res).toBe("blocked");
});

test("forged UI messages are rejected by schema and size checks", async ({ context, extId }) => {
  const ui = await context.newPage();
  await ui.goto(`chrome-extension://${extId}/pages/library/index.html`);
  const replies = await ui.evaluate(async () => {
    const send = (m: unknown) => chrome.runtime.sendMessage(m);
    return {
      contentTypeFromUi: await send({
        type: "commit",
        capability: "abcdefgh",
        requestId: "abcdefgh",
        sequence: 1,
        epoch: { global: 0, site: 0 },
        url: "http://x/",
        form: {},
        fields: [],
      }),
      extraKey: await send({ type: "listDrafts", admin: true }),
      oversized: await send({ type: "getDraft", draftId: "a".repeat(400 * 1024) }),
      unknownDraft: await send({ type: "getDraft", draftId: "doesnotexist" }),
      staleplan: await send({ type: "restore", planId: "nonexistent-plan", selections: [] }),
    };
  });
  expect(replies.contentTypeFromUi).toEqual({ ok: false, error: "invalid" });
  expect(replies.extraKey).toEqual({ ok: false, error: "invalid" });
  expect(replies.oversized).toEqual({ ok: false, error: "too-large" });
  expect(replies.unknownDraft).toEqual({ ok: false, error: "not-found" });
  expect(replies.staleplan).toEqual({ ok: false, error: "stale-plan" });
});

test("no extension-initiated network requests during capture, library and recovery", async ({ context, sw, extId }) => {
  const requests: Request[] = [];
  context.on("request", (r) => requests.push(r));
  const page = await context.newPage();
  await page.goto(`${A}/demo.html`);
  await enableSite(context, sw, extId, page);
  await page.locator("#details").pressSequentially("Network check draft", { delay: 2 });
  await waitSaved(context, sw, extId, page);
  await page.reload();
  const lib = await context.newPage();
  await lib.goto(`chrome-extension://${extId}/pages/library/index.html`);
  await lib.getByRole("button", { name: "Show values" }).click();
  const rec = await openRecovery(context, extId, await tabIdFor(sw, page));
  await rec.getByRole("button", { name: "Review this draft" }).click();
  await rec.getByRole("button", { name: "Restore selected fields" }).click();
  await expect(rec.getByText(/Restored 1/)).toBeVisible();
  const offenders = requests.filter((r) => {
    const u = new URL(r.url());
    if (u.protocol === "chrome-extension:") return false; // packaged files, not network
    const fromWorker = !!r.serviceWorker();
    const fixture = ["127.0.0.1:4173", "localhost:4173", "127.0.0.1:4174"].includes(u.host);
    return fromWorker || !fixture || !["document", "stylesheet", "script"].includes(r.resourceType());
  });
  expect(offenders.map((r) => `${r.resourceType()} ${r.url()}`)).toEqual([]);
  await (await openPopup(context, extId, await tabIdFor(sw, page))).close();
});
