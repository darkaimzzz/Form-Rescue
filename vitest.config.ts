import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "jsdom" } },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["fake-indexeddb/auto"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: [
        "packages/core/src/classification/**",
        "packages/core/src/matching/**",
        "packages/core/src/retention/**",
        "apps/extension/src/background/authorize.ts",
      ],
      thresholds: { branches: 90 },
      reporter: ["text-summary", "json-summary"],
    },
  },
});
