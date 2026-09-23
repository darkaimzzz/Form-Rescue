# Evidence

Produced by a full gate run in a **fresh clone of commit 91a8f9e** (`git clone` → `pnpm install --frozen-lockfile` → every gate), on 2026-09-24, Windows 11 Home 10.0.26200, Node 26.5.1, pnpm 12.6.0. All data is synthetic.

| File                                                 | Gate                                                                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clean-checkout-gates.log`                           | Pass/fail of each command (install, format, build, lint, typecheck, unit, integration, E2E Chromium, E2E Edge, Firefox smoke, performance ×2, a11y, package, release validate, reproducibility) |
| `unit.txt`, `integration.txt`                        | Vitest summaries and coverage (branches 95.78% on the gated modules)                                                                                                                            |
| `chromium-e2e.txt`                                   | 35 real-extension tests, Playwright Chromium 153.0.8010.12                                                                                                                                      |
| `edge-e2e.txt`                                       | Same 35 tests, installed Microsoft Edge 153.0.4234.48                                                                                                                                           |
| `firefox-smoke.json`                                 | 12 checks, installed Firefox 156.0.1 over WebDriver BiDi                                                                                                                                        |
| `accessibility.txt`                                  | 20 axe/keyboard/reflow tests (extension + website)                                                                                                                                              |
| `performance-chromium.json`, `performance-edge.json` | 200-control budgets                                                                                                                                                                             |
| `website-budget.json`                                | Homepage weight budget                                                                                                                                                                          |
| `reproducible.json`                                  | Identical ZIP checksums across two clean builds                                                                                                                                                 |
| `release-validate.txt`                               | 65/66 in that run: the only failure was `docs/implementation-status.md`, which was written after the clone; it passes in the current tree                                                       |

Lighthouse medians are in `docs/performance.md` (run from the main working tree).
