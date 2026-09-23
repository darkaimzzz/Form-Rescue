# Testing

All tests use synthetic data. Commands and output locations:

| Command                 | What it runs                                                                                                                                                                                                                                                  | Output                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm test`             | Vitest unit project (jsdom): classifier, screening, matching (incl. property tests), retention, authorization/schemas, content DOM helpers with throwing value getters; v8 coverage gate ≥90% branches on classification, matching, retention, `authorize.ts` | console, `coverage/`                                                |
| `pnpm test:integration` | Storage repository against `fake-indexeddb`: commits, merges, idempotency, revisions, isolation, epochs, limits, eviction, aborts, migrations, corruption                                                                                                     | console                                                             |
| `pnpm test:e2e:chrome`  | Builds `apps/extension/dist-e2e/chrome`, runs Playwright `e2e` project against the real extension in Chromium (`E2E_CHANNEL=msedge` for Edge)                                                                                                                 | `test-results/`                                                     |
| `pnpm test:firefox`     | Builds `dist-e2e/firefox`, drives installed Firefox over WebDriver BiDi                                                                                                                                                                                       | `test-results/firefox-smoke.json`                                   |
| `pnpm test:a11y`        | Builds everything; axe (WCAG 2.2 A/AA) on every extension page/state and every website route, keyboard/focus, reflow 320–1440 px, dark mode, forced colors, reduced motion, link checks, no external requests                                                 | `test-results/`                                                     |
| `pnpm test:performance` | 200-control budget spec + website weight budget                                                                                                                                                                                                               | `test-results/performance.json`, `test-results/website-budget.json` |
| `pnpm test:lighthouse`  | Lighthouse CI, 3 mobile runs per URL, median assertions                                                                                                                                                                                                       | `test-results/lighthouse/`                                          |

## Real-extension fixtures

`tests/fixtures/generate.mjs` writes pages; `tests/fixtures/server.mjs` serves them on `127.0.0.1` and `localhost` (distinct origins) at ports 4173/4174: demo form, login, checkout, dynamic form, SPA with path/query/hash routes, React- and Vue-controlled inputs, open shadow root, repeated fields, autofill-like prefill, iframe, session expiry/sign-in return, sensitive fields, 200-control form, fields outside forms, framework that rejects external values.

### The E2E build and the permission prompt

Automation can't click the browser's own permission prompt. The E2E build (`dist-e2e`, never packaged) therefore pre-grants `http://127.0.0.1/*` and `http://localhost/*`. The in-product flow still runs: popup click → permission check → `enableSite` → registration and injection. What remains **manual**: the real prompt's grant and denial paths (see `docs/browser-support.md`). Revocation _is_ automated, through the browser's own site-access control (`chrome://extensions` `developerPrivate.updateExtensionConfiguration`), which fires `permissions.onRemoved`.

The E2E build also compiles in User Timing marks (`fr-handler`, `fr-commit`) for performance measurement. Release bundles don't contain them (checked by `release:validate`).

### Crash harness

`durability.spec.ts` installs and cleanly closes the profile once, relaunches, saves, then hard-kills every browser process for that profile (`Stop-Process -Force` / `pkill -9`) and relaunches. A kill seconds after a _first-ever_ install loses Chrome's install record and Chrome then garbage-collects that extension's storage — a harness artifact unrelated to real users, which is why the clean install step exists. The test asserts that the acknowledged commit survives; it makes no claim about text typed after the last acknowledgement.

## Evidence matrix

| PRD test                                   | Spec                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Refresh after durable save                 | `recovery.spec.ts`                                                                       |
| Close/reopen tab                           | `scenarios.spec.ts` "closed tab"                                                         |
| Full browser restart                       | `durability.spec.ts`                                                                     |
| Force-kill after ack                       | `durability.spec.ts`                                                                     |
| Force-kill before commit                   | `durability.spec.ts` (no exact-tail claim)                                               |
| Navigate away/back, BFCache                | `scenarios.spec.ts`                                                                      |
| SPA path/query/hash; stale restore blocked | `scenarios.spec.ts`                                                                      |
| Session timeout / login return             | `scenarios.spec.ts`                                                                      |
| Two tabs                                   | `scenarios.spec.ts`                                                                      |
| Worker suspension/restart                  | `durability.spec.ts` (stopped via `chrome://serviceworker-internals`)                    |
| Revocation / delete during queued save     | `scenarios.spec.ts`                                                                      |
| Framework rerender after restore           | `scenarios.spec.ts` (reported as failed + copy)                                          |
| Same-origin changed account                | `scenarios.spec.ts` (different query never offered); review always requires confirmation |
| No network during capture/recovery         | `privacy.spec.ts` (page and service-worker requests observed)                            |

## Manual checks

Keyboard walkthroughs were exercised by automated keyboard tests. Screen-reader passes (NVDA, VoiceOver) and branded-Chrome/real-prompt checks have **not** been done; they're tracked in `docs/implementation-status.md`.
