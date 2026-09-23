import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// A production origin is an explicit configuration input. Without it the build is a
// preview: no canonical URLs, no sitemap, and robots disallow indexing (see src/config.ts).
// On Vercel, production deployments use the project's production domain; preview
// deployments stay noindex.
if (!process.env.PUBLIC_SITE_ORIGIN && process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  process.env.PUBLIC_SITE_ORIGIN = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
}
// The public repository is known; an explicit env value still takes precedence.
process.env.PUBLIC_REPO_URL ??= "https://github.com/darkaimzzz/Form-Rescue";

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
