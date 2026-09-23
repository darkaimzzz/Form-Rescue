import type { APIRoute } from "astro";
import { config } from "../config";

// Preview builds (no configured origin) must not be indexed.
export const GET: APIRoute = () => {
  const body = config.siteOrigin
    ? `User-agent: *\nAllow: /\n\nSitemap: ${config.siteOrigin}/sitemap-index.xml\n`
    : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
