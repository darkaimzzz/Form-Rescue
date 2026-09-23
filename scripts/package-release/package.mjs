/**
 * Produces unsigned distribution artifacts from the built extension:
 *   release/form-rescue-<version>-chrome.zip   (Chrome and Edge)
 *   release/form-rescue-<version>-firefox.zip
 *   release/form-rescue-<version>-source.zip   (tracked files at HEAD; Firefox source requirement)
 *   release/sbom.cdx.json                      (CycloneDX 1.5, shipped runtime dependencies)
 *   release/third-party-licenses.json
 *   release/SHA256SUMS.txt
 *
 * ZIPs are deterministic: sorted entries, fixed timestamps, fixed attributes.
 * Run via `pnpm package` (builds first).
 */
import { createHash } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const root = process.cwd();
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const out = path.join(root, "release");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// 1980-01-01 00:00 in DOS format: the earliest representable, fixed for reproducibility.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** Minimal deterministic ZIP writer (deflate, no extra fields). */
export function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const nameBuf = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + compressed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

async function filesUnder(dir, base = dir) {
  const list = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) list.push(...(await filesUnder(full, base)));
    else list.push({ name: path.relative(base, full).split(path.sep).join("/"), data: await readFile(full) });
  }
  return list;
}

const artifacts = [];
for (const target of ["chrome", "firefox"]) {
  const dir = path.join(root, "apps/extension/dist", target);
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
  if (manifest.host_permissions) throw new Error(`${target}: development host grants present — build without --e2e`);
  const file = `form-rescue-${version}-${target}.zip`;
  await writeFile(path.join(out, file), zip(await filesUnder(dir)));
  artifacts.push(file);
}

// Source archive of tracked files at HEAD (what reviewers rebuild from).
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const sourceEntries = [];
for (const f of tracked) {
  try {
    sourceEntries.push({ name: `form-rescue-${version}/${f}`, data: await readFile(f) });
  } catch {
    /* deleted in working tree */
  }
}
const sourceFile = `form-rescue-${version}-source.zip`;
await writeFile(path.join(out, sourceFile), zip(sourceEntries));
artifacts.push(sourceFile);

// SBOM + license inventory for runtime dependencies bundled into the extension.
const tree = JSON.parse(execSync("pnpm --filter @form-rescue/extension list --prod --depth Infinity --json", { encoding: "utf8" }));
const deps = new Map();
(function walk(d) {
  for (const [name, v] of Object.entries(d ?? {})) {
    if (!v.version.startsWith("link:")) deps.set(`${name}@${v.version}`, { name, version: v.version, path: v.path });
    walk(v.dependencies);
  }
})(tree[0].dependencies);
const components = [];
const licenses = [];
for (const d of [...deps.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const pkg = JSON.parse(await readFile(path.join(d.path, "package.json"), "utf8"));
  const license = typeof pkg.license === "string" ? pkg.license : "UNKNOWN";
  components.push({
    type: "library",
    name: d.name,
    version: d.version,
    purl: `pkg:npm/${d.name.replace("@", "%40")}@${d.version}`,
    licenses: [{ license: { id: license } }],
  });
  licenses.push({ name: d.name, version: d.version, license, homepage: pkg.homepage ?? null });
}
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: { component: { type: "application", name: "form-rescue", version, licenses: [{ license: { id: "MIT" } }] } },
  components,
};
await writeFile(path.join(out, "sbom.cdx.json"), JSON.stringify(sbom, null, 2) + "\n");
await writeFile(path.join(out, "third-party-licenses.json"), JSON.stringify(licenses, null, 2) + "\n");
artifacts.push("sbom.cdx.json", "third-party-licenses.json");

const sums = [];
for (const f of artifacts)
  sums.push(
    `${createHash("sha256")
      .update(await readFile(path.join(out, f)))
      .digest("hex")}  ${f}`,
  );
await writeFile(path.join(out, "SHA256SUMS.txt"), sums.join("\n") + "\n");
console.log(sums.join("\n"));
