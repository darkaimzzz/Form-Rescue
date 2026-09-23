import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { buildManifest } from "../../../scripts/build-manifests/manifest.mjs";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");
const args = new Map(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, "").split("="))
    .map(([k, v]) => [k, v ?? true]),
);
const targets = args.get("target") === "all" ? ["chrome", "firefox"] : [args.get("target") ?? "chrome"];
const e2e = args.has("e2e");
const watch = args.has("watch");
const { version } = JSON.parse(await readFile(path.join(root, "../../package.json"), "utf8"));

const pages = {
  popup: "src/popup/index.html",
  library: "src/pages/library/index.html",
  recovery: "src/pages/recovery/index.html",
  options: "src/pages/options/index.html",
  onboarding: "src/pages/onboarding/index.html",
};

for (const target of targets) {
  const outDir = path.join(root, e2e ? "dist-e2e" : "dist", target);
  await rm(outDir, { recursive: true, force: true });
  const common = {
    configFile: false,
    root: path.join(root, "src"),
    envDir: path.join(root, "../.."),
    logLevel: "warn",
    define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production"), __FR_E2E__: JSON.stringify(e2e) },
  };
  const w = watch ? {} : null;
  // Extension pages (React). No module-preload polyfill: it would use fetch, which connect-src 'none' forbids.
  await build({
    ...common,
    base: "/",
    plugins: [react()],
    build: {
      outDir,
      emptyOutDir: false,
      modulePreload: { polyfill: false },
      sourcemap: false,
      watch: w,
      rollupOptions: { input: Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, path.join(root, v)])) },
    },
  });
  // Background and content scripts as single classic scripts.
  for (const [name, entry] of [
    ["background", "src/background/index.ts"],
    ["content", "src/content/index.ts"],
  ]) {
    await build({
      ...common,
      build: {
        outDir,
        emptyOutDir: false,
        sourcemap: false,
        watch: w,
        lib: { entry: path.join(root, entry), formats: ["iife"], name: `formRescue_${name}`, fileName: () => `${name}.js` },
      },
    });
  }
  await mkdir(path.join(outDir, "icons"), { recursive: true });
  await cp(path.join(root, "public/icons"), path.join(outDir, "icons"), { recursive: true });
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(buildManifest(target, { version, e2e }), null, 2) + "\n");
  console.log(`Built ${target}${e2e ? " (e2e)" : ""} → ${path.relative(path.join(root, "../.."), outDir)}`);
}
