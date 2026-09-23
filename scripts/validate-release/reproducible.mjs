/**
 * Reproducibility check: clean build + package twice, compare extension ZIP checksums.
 * Run: pnpm release:reproducible   Writes test-results/reproducible.json.
 */
import { execSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

async function once() {
  for (const d of ["apps/extension/dist", "release"]) await rm(d, { recursive: true, force: true });
  execSync("pnpm --filter @form-rescue/extension build && node scripts/package-release/package.mjs", { stdio: "inherit" });
  const sums = await readFile("release/SHA256SUMS.txt", "utf8");
  return Object.fromEntries(
    sums
      .trim()
      .split("\n")
      .map((l) => l.split(/\s+/).reverse()),
  );
}

const a = await once();
const b = await once();
const zips = Object.keys(a).filter((f) => /-(chrome|firefox)\.zip$/.test(f));
const result = {
  checkedAt: new Date().toISOString(),
  node: process.version,
  files: zips.map((f) => ({ file: f, first: a[f], second: b[f], identical: a[f] === b[f] })),
};
await mkdir("test-results", { recursive: true });
await writeFile("test-results/reproducible.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.files.every((f) => f.identical) ? 0 : 1);
