import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 60_000,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: { trace: "retain-on-failure", actionTimeout: 15_000 },
  webServer: [
    {
      command: "node tests/fixtures/generate.mjs && node tests/fixtures/server.mjs",
      url: "http://127.0.0.1:4173/index.html",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Built website (pnpm build); used by tests/accessibility/website.spec.ts.
      command: "node scripts/serve-static.mjs apps/website/dist 4321",
      url: "http://127.0.0.1:4321/robots.txt",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: "e2e", testDir: "tests/e2e", testIgnore: /performance/ },
    { name: "performance", testDir: "tests/e2e", testMatch: /performance\.spec\.ts/ },
    { name: "a11y", testDir: "tests/accessibility" },
  ],
});
