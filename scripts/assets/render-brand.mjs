/**
 * Renders original brand SVGs to the PNG sizes each target needs, using
 * Playwright's Chromium. Run: node scripts/assets/render-brand.mjs
 */
import { chromium } from "@playwright/test";
import { readFile, mkdir, copyFile } from "node:fs/promises";

const svg = await readFile("assets/brand/mark.svg", "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
await mkdir("apps/extension/public/icons", { recursive: true });
await mkdir("apps/website/public", { recursive: true });
for (const size of [16, 32, 48, 128, 180, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  const out = `assets/brand/mark-${size}.png`;
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  if ([16, 32, 48, 128].includes(size)) await copyFile(out, `apps/extension/public/icons/icon-${size}.png`);
}
await copyFile("assets/brand/mark-180.png", "apps/website/public/apple-touch-icon.png");
await copyFile("assets/brand/mark.svg", "apps/website/public/favicon.svg");
await copyFile("assets/brand/mark-32.png", "apps/website/public/favicon-32.png");

// 1200×630 social preview (original artwork, system font).
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<html><body style="margin:0">
<div style="width:1200px;height:630px;background:#F7F8FA;display:flex;align-items:center;gap:72px;padding:0 96px;box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#151A23">
  <div style="flex:none">${svg.replace("<svg ", '<svg width="220" height="220" ')}</div>
  <div>
    <div style="font-size:30px;font-weight:600;color:#006B5B;margin-bottom:12px">Form Rescue</div>
    <div style="font-size:80px;font-weight:700;letter-spacing:-2px;line-height:1.02">Get your words back.</div>
    <div style="font-size:30px;color:#586170;margin-top:24px;line-height:1.35">Recover saved form drafts on the sites you choose.<br>Local to your browser. Open source.</div>
  </div>
</div></body></html>`);
await page.screenshot({ path: "assets/brand/social-preview.png" });
await copyFile("assets/brand/social-preview.png", "apps/website/public/social-preview.png");
await browser.close();
console.log("Rendered brand assets.");
