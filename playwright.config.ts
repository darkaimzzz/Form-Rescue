import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// The built website is only served when it exists (pnpm test:a11y builds it first);
// extension-only runs such as test:e2e:chrome don't need it.
const websiteBuilt = existsSync("apps/website/dist/index.html");

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
    ...(websiteBuilt
      ? [
          {
            // Built website; used by tests/accessibility/website.spec.ts.
            command: "node scripts/serve-static.mjs apps/website/dist 4321",
            url: "http://127.0.0.1:4321/robots.txt",
            reuseExistingServer: !process.env.CI,
          },
        ]
      : []),
  ],
  projects: [
    { name: "e2e", testDir: "tests/e2e", testIgnore: /performance/ },
    { name: "performance", testDir: "tests/e2e", testMatch: /performance\.spec\.ts/ },
    { name: "a11y", testDir: "tests/accessibility" },
  ],
});
