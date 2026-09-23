---
layout: ../../layouts/Doc.astro
title: Contributing
description: Build Form Rescue from source, run its tests, and contribute safely using synthetic fixtures.
---

Form Rescue is open source. Contributions are welcome, code, tests, docs, translations and compatibility reports.

## Prerequisites

- Node.js 24 LTS (see `.nvmrc`)
- pnpm 12 (`packageManager` in `package.json`)
- For browser tests: Playwright's Chromium (`npx playwright install chromium`), and optionally installed Microsoft Edge and Firefox

## Build and test

```sh
pnpm install --frozen-lockfile
pnpm build                 # extension (Chrome/Edge + Firefox) and website
pnpm test                  # unit tests with coverage
pnpm test:integration      # IndexedDB repository tests
pnpm test:e2e:chrome       # real-extension tests in Chromium
pnpm test:firefox          # real Firefox smoke test (installed Firefox)
pnpm test:a11y             # axe checks for the extension and website
pnpm lint && pnpm typecheck
```

`pnpm fixtures` serves the synthetic test pages at `http://127.0.0.1:4173/`.

## Rules that keep users safe

- **Synthetic data only.** Never put real drafts, real URLs, credentials or browser profiles in fixtures, screenshots, recordings or issues.
- **Read metadata before values.** Eligibility must be decided without reading a field's value.
- **No network code** in the extension. No analytics or remote code of any kind.
- **Render draft text as text.** Never as HTML.

The full guide, including how to add support for a new kind of field safely, is `CONTRIBUTING.md` in the repository.

## Sign-off

Contributions use the [Developer Certificate of Origin](https://developercertificate.org/): add `Signed-off-by` to each commit with `git commit -s`. There is no CLA.

## License

Form Rescue's code, documentation and original artwork are released under the MIT License. Third-party components keep their own licenses; see `docs/third-party-notices.md`. The license doesn't grant rights to third-party trademarks.
