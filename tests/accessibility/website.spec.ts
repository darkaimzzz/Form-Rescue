import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Website checks against the production build (apps/website/dist served on :4321). */
const SITE = "http://127.0.0.1:4321";
const ROUTES = [
  "/",
  "/demo/",
  "/privacy/",
  "/try/",
  "/docs/",
  "/docs/getting-started/",
  "/docs/recovery/",
  "/docs/privacy-and-storage/",
  "/docs/permissions/",
  "/docs/browser-support/",
  "/docs/troubleshooting/",
  "/docs/contributing/",
  "/changelog/",
  "/404.html",
];

async function audit(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(
    r.violations.map(
      (v) =>
        `${label}: ${v.id} ${v.help} → ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(", ")}`,
    ),
  ).toEqual([]);
}

for (const route of ROUTES) {
  test(`axe + reflow + no external requests: ${route}`, async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith(SITE) && !r.url().startsWith("data:")) external.push(r.url());
    });
    await page.goto(`${SITE}${route}`);
    await audit(page, route);
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} overflows at ${width}px`).toBeLessThanOrEqual(0);
    }
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(400); // let 160 ms UI transitions settle before sampling contrast
    await audit(page, `${route} (dark)`);
    expect(external).toEqual([]);
    // Preview builds: no canonical, noindex.
    expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // One h1 per page; skip link present.
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".skip-link")).toHaveAttribute("href", "#main");
  });
}

test("demo simulation: every state passes axe and works by keyboard; nothing persists", async ({ page }) => {
  await page.goto(`${SITE}/demo/`);
  const demo = page.locator("[data-demo]").first();
  await audit(page, "demo/ready");
  await demo.getByRole("button", { name: "Simulate refresh" }).focus();
  await page.keyboard.press("Enter");
  await expect(demo.getByRole("textbox")).toHaveValue("");
  await expect(demo.getByRole("button", { name: "Review saved draft" })).toBeFocused();
  await audit(page, "demo/interrupted");
  await page.keyboard.press("Enter");
  await expect(demo.getByRole("checkbox", { name: /Restore/ })).toBeFocused();
  await audit(page, "demo/draft-review");
  await demo.getByRole("button", { name: "Restore selected field" }).click();
  await expect(demo.getByRole("textbox")).toHaveValue(/export button keeps spinning/);
  await expect(demo.getByRole("status")).toHaveText("Restored 1 field.");
  await audit(page, "demo/restored");
  const stored = await page.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie }));
  expect(stored).toEqual({ ls: 0, ss: 0, cookie: "" });
  await page.reload();
  await expect(page.locator("[data-demo]").first()).toHaveAttribute("data-state", "ready");
});

test("mobile menu: keyboard opens, Escape closes and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`${SITE}/`);
  const button = page.getByRole("button", { name: "Menu" });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link").first()).toBeFocused();
  await audit(page, "menu open");
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused();
});

test("prelaunch CTAs are honest: developer build link resolves, no store links", async ({ page, request }) => {
  await page.goto(`${SITE}/`);
  await expect(page.getByRole("link", { name: "Load the developer build" }).first()).toHaveAttribute("href", "/docs/getting-started/#developer-build");
  await expect(page.getByText("Store release pending.").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Install for/ })).toHaveCount(0);
  const html = await (await request.get(`${SITE}/docs/getting-started/`)).text();
  expect(html).toContain('id="developer-build"');
});

test("internal links resolve", async ({ page, request }) => {
  const seen = new Set<string>();
  const broken: string[] = [];
  for (const route of ROUTES.filter((r) => r !== "/404.html")) {
    await page.goto(`${SITE}${route}`);
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")!));
    for (const href of hrefs) {
      if (!href.startsWith("/") || href.startsWith("//")) continue;
      const [path, hash] = href.split("#");
      const key = `${path}#${hash ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const res = await request.get(`${SITE}${path}`);
      if (!res.ok()) {
        broken.push(`${route} → ${href} (${res.status()})`);
        continue;
      }
      if (hash && !(await res.text()).includes(`id="${hash}"`)) broken.push(`${route} → ${href} (missing #${hash})`);
    }
  }
  expect(broken).toEqual([]);
});

test("reduced motion and forced colors render without violations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto(`${SITE}/`);
  await audit(page, "home forced-colors");
  const zoomOverflow = await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });
  expect(zoomOverflow).toBeLessThanOrEqual(0);
});
