/**
 * Website weight budgets (PRD §13) measured on the built homepage:
 * first-load JS ≤ 120 KiB gzip (demo island ≤ 60 KiB of it), initial
 * transfer ≤ 500 KiB excluding lazy images and user-initiated media.
 * Writes test-results/website-budget.json.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const dist = "apps/website/dist";
const html = await readFile(path.join(dist, "index.html"), "utf8");
const gz = (buf) => gzipSync(buf).length;
const kib = (n) => +(n / 1024).toFixed(1);

const refs = (re) => [...html.matchAll(re)].map((m) => m[1]);
const scripts = refs(/<script[^>]+src="([^"]+)"/g);
const inlineScripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const styles = refs(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g);
const eagerImages = [...html.matchAll(/<img\b([^>]*)>/g)]
  .filter((m) => !/loading="lazy"/.test(m[1]))
  .map((m) => /src="([^"]+)"/.exec(m[1])?.[1])
  .filter(Boolean);
const icons = refs(/<link[^>]+rel="icon"[^>]+href="([^"]+)"/g).slice(0, 1);

const file = (url) => readFile(path.join(dist, url.replace(/^\//, "")));
let js = inlineScripts.reduce((n, s) => n + gz(Buffer.from(s)), 0);
for (const s of scripts) js += gz(await file(s));
let css = 0;
for (const s of styles) css += gz(await file(s));
let img = 0;
for (const s of [...eagerImages, ...icons]) img += (await file(s)).length;
const doc = gz(Buffer.from(html));
const demoJs = inlineScripts.filter((s) => s.includes("data-demo")).reduce((n, s) => n + gz(Buffer.from(s)), 0);
const total = doc + js + css + img;

const result = {
  measuredAt: new Date().toISOString(),
  page: "/",
  htmlGzipKiB: kib(doc),
  firstLoadJsGzipKiB: kib(js),
  demoIslandJsGzipKiB: kib(demoJs),
  cssGzipKiB: kib(css),
  eagerImagesKiB: kib(img),
  initialTransferKiB: kib(total),
  budgets: { firstLoadJsGzipKiB: 120, demoIslandJsGzipKiB: 60, initialTransferKiB: 500 },
};
await mkdir("test-results", { recursive: true });
await writeFile("test-results/website-budget.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
const fail = js > 120 * 1024 || demoJs > 60 * 1024 || total > 500 * 1024;
if (fail) {
  console.error("Website budget exceeded.");
  process.exit(1);
}
