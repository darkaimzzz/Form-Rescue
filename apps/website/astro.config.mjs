import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// A production origin is an explicit configuration input. Without it the build is a
// preview: no canonical URLs, no sitemap, and robots disallow indexing (see src/config.ts).
const origin = process.env.PUBLIC_SITE_ORIGIN?.replace(/\/$/, "");

export default defineConfig({
  site: origin || undefined,
  trailingSlash: "always",
  build: { format: "directory", inlineStylesheets: "auto" },
  // Plain, high-contrast code blocks styled by our tokens (theme colors failed contrast checks).
  markdown: { syntaxHighlight: false },
  integrations: origin ? [sitemap()] : [],
  vite: { envDir: "../.." },
});
