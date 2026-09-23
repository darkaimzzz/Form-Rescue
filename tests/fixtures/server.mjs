/**
 * Synthetic fixture server for real-extension tests. Serves the same pages on
 * two ports; with the two hostnames 127.0.0.1 and localhost that yields
 * distinct origins. Only synthetic content. Run: pnpm fixtures
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("./pages/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
export const PORTS = [4173, 4174];

function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const cookies = Object.fromEntries((req.headers.cookie ?? "").split(/;\s*/).filter(Boolean).map((c) => c.split("=")));
  // Synthetic session flow: /session/form needs a session cookie, else redirect to login.
  if (url.pathname === "/session/form" && cookies.session !== "1") {
    res.writeHead(302, { location: "/session/login.html?return=/session/form" }).end();
    return;
  }
  if (url.pathname === "/session/form") url.pathname = "/session/form.html";
  if (url.pathname === "/session/login" && req.method === "POST") {
    res.writeHead(302, { "set-cookie": "session=1; Path=/", location: "/session/form" }).end();
    return;
  }
  if (url.pathname === "/session/logout") {
    res.writeHead(302, { "set-cookie": "session=; Path=/; Max-Age=0", location: "/session/login.html" }).end();
    return;
  }
  if (url.pathname.startsWith("/spa/")) url.pathname = "/spa.html"; // SPA fallback
  if (url.pathname === "/") url.pathname = "/index.html";
  const file = normalize(join(dir, url.pathname));
  if (!file.startsWith(normalize(dir))) return void res.writeHead(403).end();
  readFile(file).then(
    (body) => res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body),
    () => res.writeHead(404, { "content-type": "text/plain" }).end("not found"),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  for (const port of PORTS) createServer(handler).listen(port, "127.0.0.1");
  // localhost resolves to 127.0.0.1 here; the hostname differs, so the origin differs.
  console.log(`Fixtures: http://127.0.0.1:${PORTS[0]}/  http://localhost:${PORTS[0]}/  http://127.0.0.1:${PORTS[1]}/`);
}
