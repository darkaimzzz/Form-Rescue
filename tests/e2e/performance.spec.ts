import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { A, enableSite, expect, test } from "./harness.js";

/**
 * Local performance budgets (PRD §13) on the 200-control fixture, measured in
 * the E2E build, which records User Timing entries around the content handler
 * and the commit round trip. Results: test-results/performance.json.
 */
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? 0;
};

test("200-control form: typing budget, handler p95, commit latency, idle quiet", async ({ context, sw, extId, browserName }) => {
  const page = await context.newPage();
  await page.goto(`${A}/perf.html`);
  await enableSite(context, sw, extId, page);
  await page.evaluate(() => {
    (window as unknown as { __long: number[] }).__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window as unknown as { __long: number[] }).__long.push(e.duration))).observe({
      type: "longtask",
      buffered: false,
    });
  });

  // Type into 20 fields spread across the form, pausing so debounced commits happen.
  for (let i = 0; i < 200; i += 10) {
    await page.locator(`#f${i}`).pressSequentially(`Synthetic text for field ${i}. `, { delay: 15 });
    await page.waitForTimeout(450);
  }
  await page.locator("#f1").click();
  await page.waitForTimeout(1500);

  const m = await page.evaluate(() => ({
    handler: performance.getEntriesByName("fr-handler").map((e) => e.duration),
    commit: performance.getEntriesByName("fr-commit").map((e) => e.duration),
    long: (window as unknown as { __long: number[] }).__long,
  }));

  // Idle: no extension activity once typing stops.
  const before = await page.evaluate(() => performance.getEntriesByName("fr-commit").length);
  await page.waitForTimeout(5000);
  const after = await page.evaluate(() => performance.getEntriesByName("fr-commit").length);

  const result = {
    measuredAt: new Date().toISOString(),
    browser: `${browserName} ${context.browser()?.version() ?? (await sw.evaluate(() => navigator.userAgent))}`,
    machine: {
      platform: `${os.platform()} ${os.release()}`,
      cpu: os.cpus()[0]?.model,
      cores: os.cpus().length,
      memoryGiB: Math.round(os.totalmem() / 2 ** 30),
    },
    fixture: "tests/fixtures/pages/perf.html (200 controls)",
    handlerSamples: m.handler.length,
    handlerP95Ms: +pct(m.handler, 95).toFixed(2),
    handlerMaxMs: +Math.max(...m.handler).toFixed(2),
    commitSamples: m.commit.length,
    commitRoundTripP95Ms: +pct(m.commit, 95).toFixed(1),
    // A settled edit is committed after the 300 ms debounce plus the round trip.
    settledEditToAckP95Ms: +(300 + pct(m.commit, 95)).toFixed(1),
    longTasksOver50Ms: m.long.filter((d) => d > 50).length,
    idleCommitsDuring5s: after - before,
  };
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/performance.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  expect(m.handler.length).toBeGreaterThan(300);
  expect(result.handlerP95Ms).toBeLessThan(5);
  expect(result.settledEditToAckP95Ms).toBeLessThan(1000);
  expect(result.longTasksOver50Ms).toBe(0);
  expect(result.idleCommitsDuring5s).toBe(0);
});
