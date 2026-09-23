# Performance

Budgets from PRD §13, measured locally. These are lab measurements on one machine, not field data.

## Method

- Extension: `tests/e2e/performance.spec.ts` on `tests/fixtures/pages/perf.html` (200 controls). Types 20 sentences at 15 ms/key into fields across the form, pausing 450 ms between fields. The E2E build records `performance.measure` around the content handler (`fr-handler`) and the commit round trip (`fr-commit`); a `longtask` observer records main-thread tasks >50 ms. Idle check: no commits during 5 s after typing stops.
- Website: `scripts/validate-release/website-budget.mjs` on the built homepage; Lighthouse CI (3 mobile runs per URL, median).

## Results (2026-09-24, Windows 11, `docs/evidence/performance-*.json`)

| Metric                                                          | Budget          | Chromium 153                      | Edge 153 |
| --------------------------------------------------------------- | --------------- | --------------------------------- | -------- |
| Content handler p95                                             | < 5 ms          | 0.6–0.7 ms                        | 0.6 ms   |
| Content handler max                                             | no task > 50 ms | 31–41 ms (first edit of the form) | 38–39 ms |
| Long tasks > 50 ms while typing                                 | 0               | 0                                 | 0        |
| Settled edit → committed ack p95 (300 ms debounce + round trip) | < 1000 ms       | 325–328 ms                        | ~330 ms  |
| Commits while idle (5 s)                                        | 0               | 0                                 | 0        |

The first edit on a form is the most expensive: it computes the form descriptor and the whole-form sensitivity scan once (cached until DOM mutations).

| Website                                     | Budget    | Result                                                                                       |
| ------------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| Homepage first-load JS (gzip)               | ≤ 120 KiB | 1.3 KiB                                                                                      |
| Demo island JS (gzip)                       | ≤ 60 KiB  | 0.7 KiB                                                                                      |
| Initial transfer (excl. lazy images, media) | ≤ 500 KiB | ~85 KiB                                                                                      |
| Lighthouse mobile performance (median)      | ≥ 0.90    | 1.00 on /, /demo/, /docs/getting-started/, /privacy/                                         |
| Lighthouse accessibility                    | ≥ 0.95    | 0.98–1.00                                                                                    |
| Lighthouse best practices                   | ≥ 0.90    | 1.00                                                                                         |
| Lighthouse SEO                              | ≥ 0.90    | 1.00 with a production origin; 0.63–0.66 in preview builds, which are deliberately `noindex` |

The recording (`recovery.webm`, ~2 MB) loads only on demand (`preload="none"`).

Field Core Web Vitals (LCP/CLS/INP) have not been measured: there is no deployment and no analytics.
