# ADR 0001 — Stack and build

**Status:** accepted, 2026-09-23

**Context.** The PRD asks for strict TypeScript, pnpm workspaces, an active Node LTS, Vite + React for extension pages, lightweight content scripts, Astro for the website, and pinned versions.

**Decision.**

- Node **24 LTS** pinned in `.nvmrc`, `engines >=24`, CI uses 24. (Development happened on Node 26.5.1, which is current but not yet LTS.)
- pnpm 12.6.0 (`packageManager`), one lockfile; install scripts allow-listed (`allowBuilds: esbuild`).
- **TypeScript 6.0.3**, not 7.x: typescript-eslint 8.70 supports `<6.1`.
- Vite 8.3 builds React pages (module-preload polyfill disabled because it uses `fetch`, which `connect-src 'none'` forbids) and the background/content scripts as single IIFE bundles, so the same output works as a Chromium service worker and a Firefox event page.
- zod 4 for strict discriminated schemas, configured `jitless` (no `Function` constructor at runtime under CSP). Its bundle still contains an unused `new Function` probe that `web-ext lint` reports as a warning.
- A tiny browser adapter (`browser ?? chrome`) instead of a polyfill: both targets are promise-based in MV3.
- Astro 7 static output; the demo is a small Astro `<script>` island (0.7 KiB gzip), not React.

**Alternatives.** webextension-polyfill (unnecessary for MV3); WXT/Plasmo (generate manifests and APIs we would have to audit); TypeScript 7 (lint incompatibility).

**Consequences.** Three Vite builds per target; manifests come from our own generator and are audited by `release:validate`.
