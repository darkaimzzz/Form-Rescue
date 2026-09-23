# Browser support

Recorded at implementation start (2026-09-23/24) on Windows 11 Home 10.0.26200. Only listed environments were exercised.

## Versions available and tested

| Environment                | Exact version | How it was exercised                                                                                                                                                                                | Result                                          | Evidence                                                                    |
| -------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| Playwright Chromium        | 153.0.8010.12 | Full suite: 35 E2E (recovery, privacy, durability incl. worker stop, restart and force-kill, scenarios), performance, extension accessibility                                                       | Pass                                            | `docs/evidence/chromium-e2e.txt`, `docs/evidence/performance-chromium.json` |
| Microsoft Edge (installed) | 153.0.4234.48 | Same suite via `E2E_CHANNEL=msedge`                                                                                                                                                                 | Pass                                            | `docs/evidence/edge-e2e.txt`, `docs/evidence/performance-edge.json`         |
| Firefox (installed)        | 156.0.1       | `pnpm test:firefox`: WebDriver BiDi temporary install, 12 checks (enable, register, durable save, reload, review, no pre-confirmation mutation, restore, sensitive login form, storage, delete all) | Pass                                            | `docs/evidence/firefox-smoke.json`                                          |
| Google Chrome (installed)  | 153.0.8010.53 | Branded Chrome ignores `--load-extension` (since Chrome 137), so it can't be automated this way                                                                                                     | **Not yet exercised, release blocker for v1.0** | n/a                                                                         |

Previous major versions (Chrome/Edge 152, Firefox 155 and ESR 140) were not installed and have not been tested, so the manifests declare `minimum_chrome_version: 153` and `strict_min_version: 156.0`. Lower them only with evidence. macOS and Linux are untested.

## API minimums relied on

MV3 `scripting.registerContentScripts`, `permissions.request/onRemoved`, `optional_host_permissions`, `action.setBadgeText`, `alarms`, IndexedDB `durability: "strict"`, `Element.checkVisibility` (with a `getClientRects` fallback). Firefox: event-page `background.scripts`, `browser_specific_settings.gecko.data_collection_permissions`. All are satisfied by the tested versions.

## Known differences

- **Background:** service worker (Chromium) vs event page (Firefox). Both idle out; no state that matters lives in memory.
- **Firefox host permissions** are user-controlled in MV3; temporary add-ons don't get host access until the user grants it. The Firefox smoke test pre-seeds the grant for the fixture hosts only (equivalent to accepting the prompt).
- **Firefox match patterns** reject ports (`tabs.query({url})` with a port fails); the extension never relies on port patterns.
- **WebDriver BiDi** can't send input to privileged extension pages, so the Firefox smoke clicks extension buttons via DOM `click()`; typing into web pages uses trusted BiDi input.
- **Firefox temporary add-ons** are removed with their storage on restart; persistent testing requires a signed build.
- Brave and other Chromium derivatives: best effort, untested, no compatibility claim. Safari, mobile and private windows: unsupported.

## Manual checks still required before v1.0

1. Branded Google Chrome 153+: load `dist/chrome`, run the short recovery/privacy smoke from `docs/release.md`, including the real permission prompt (grant and deny).
2. Firefox signed build: install, restart Firefox, confirm drafts persist; real permission prompt grant/deny.
3. Screen readers: NVDA (Windows) and VoiceOver (macOS) on popup, review page, library and settings.
