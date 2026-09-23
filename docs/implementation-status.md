# Implementation status

Last updated: 2026-09-24. Overall: **complete as a casual open-source project.** Decision (2026-09-24, owner): no browser-store publication. Distribution is the developer build (ZIPs on GitHub releases, or build from source) plus the website at https://form-rescue.vercel.app. Evidence files are in `docs/evidence/` (copied from a clean-checkout run) unless noted.

## Milestones

| Milestone                        | Status                                               | Notes                                                                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 Repository and feasibility    | Done                                                 | Per-site permission flow, dynamic injection, IndexedDB commit ack, worker restart, textarea restore proven in Chromium; Firefox build linted and run                                                    |
| M1 Safe capture and persistence  | Done                                                 | Classifier, screening, handshake/policies, observers, fingerprints, schemas, repository, revisions, limits, expiry, epochs, sequences, migrations, revocation, incognito refusal, save status           |
| M2 Recovery and core UX          | Done                                                 | Popup, onboarding, library, review, settings, field rules; matching, explicit replacement, revalidation, native setters, verification, copy, undo; SPA, tabs, submission, reset, storage failures       |
| M3 Browser parity and hardening  | Done for available environments                      | Firefox build + real Firefox 156 smoke; Edge 153 full suite; crash, suspension, adversarial, quota, migration, a11y, performance checks. Branded Chrome and real-prompt checks remain manual (blockers) |
| M4 Website, docs, assets         | Done                                                 | All routes, demo, docs, real screenshots and 29.6 s recording, honest prelaunch CTAs; budgets and Lighthouse pass                                                                                       |
| M5 Release candidate and handoff | Done locally; publication blocked on external inputs | CI workflows, templates, SBOM, license inventory, checksums, reproducibility check, packages, listing copy                                                                                              |

## Requirements

| ID    | Requirement                                 | Status                                             | Evidence                                                                                                                    |
| ----- | ------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| FR-01 | Site opt-in, minimal permissions            | Pass (automated), prompt grant/deny manual pending | `recovery.spec.ts` (disabled sites untouched), `scenarios.spec.ts` (revocation, disable), `release:validate` manifest audit |
| FR-02 | Eligible edits saved locally                | Pass                                               | `recovery.spec.ts`, `storage.test.ts`, DB inspection in E2E                                                                 |
| FR-03 | Exclusions precede value reads              | Pass                                               | `content-dom.test.ts` (throwing getters), `classification.test.ts`, `privacy.spec.ts` sentinels                             |
| FR-04 | Recovery after refresh/tab close/navigation | Pass                                               | `recovery.spec.ts`, `scenarios.spec.ts` (closed tab, BFCache, SPA)                                                          |
| FR-05 | Crash/restart durability                    | Pass                                               | `durability.spec.ts` (worker stop, restart, force-kill after ack)                                                           |
| FR-06 | Session-loss scope honest                   | Pass                                               | `scenarios.spec.ts` session expiry (prose restored, credentials never stored)                                               |
| FR-07 | No automatic overwrite                      | Pass                                               | `recovery.spec.ts` (populated fields, conflict, no pre-confirmation mutation)                                               |
| FR-08 | Conservative matching                       | Pass                                               | `matching.test.ts` (incl. properties), `scenarios.spec.ts` repeated fields, SPA route mismatch                              |
| FR-09 | Origin/document isolation                   | Pass                                               | `authorize.test.ts`, `privacy.spec.ts` forged messages, cross-origin test, stale-plan test                                  |
| FR-10 | Retention/deletion                          | Pass                                               | `retention.test.ts`, `storage.test.ts`, `scenarios.spec.ts` delete during queued save                                       |
| FR-11 | Browser parity                              | Partial                                            | Chromium 153 + Edge 153 full suites, Firefox 156 smoke pass; **branded Chrome not exercised**                               |
| FR-12 | Honest status and errors                    | Pass                                               | popup shows Saved only after ack (`waitSaved` used throughout), quota/too-large/revoked states, storage tests               |
| FR-13 | Zero telemetry/transmission                 | Pass                                               | `privacy.spec.ts` network observation (page + worker), bundle scan in `release:validate`, ESLint rules                      |
| FR-14 | Accessible extension and website            | Pass (automated); screen readers not yet checked   | `tests/accessibility/*`, Lighthouse                                                                                         |
| FR-15 | Website quality and storytelling            | Pass                                               | all routes, demo tests, `docs/performance.md`                                                                               |
| FR-16 | Truthful install/source CTAs                | Pass                                               | website test "prelaunch CTAs are honest"; no store URLs configured                                                          |
| FR-17 | Contributor-ready repo                      | Pass                                               | clean-clone gate log `docs/evidence/clean-checkout-gates.log`                                                               |
| FR-18 | Release-ready distribution                  | Pass locally                                       | `release/` artifacts, `release:validate`, `release:reproducible`                                                            |
| FR-19 | Sensitive-data limits disclosed             | Pass                                               | onboarding, settings privacy, website privacy/FAQ/docs, README                                                              |
| FR-20 | Real tests, not mocks                       | Pass                                               | real extension E2E; recording captured from the real extension, separate from the website simulation                        |

## Known limitations and deliberate deferrals

- No in-page "Saved draft available" chip (optional in the PRD); the toolbar badge shows a count.
- `contenteditable`, frames, localization beyond English, encrypted export — P1.
- Content scripts don't observe attribute changes inside shadow roots attached after start; eligibility is still rechecked at every capture and before every restore.
- Firefox smoke is narrower than the Chromium suite (12 checks). Firefox temporary installs lose storage on restart.
- `web-ext lint`: 0 errors, 4 warnings from bundled zod (unused `Function` probe; jitless mode is set) and React DOM (`innerHTML` internals our code never feeds).
- Dev-only audit exception: `extract-zip` via Lighthouse CI (see `docs/release.md`).

## Open items (only needed if the project is ever published to stores or resumed)

1. Manual smoke in **branded Google Chrome** with the real permission prompt (grant and deny).
2. Manual real-prompt grant/deny and signed-build persistence check in **Firefox**.
3. **Screen reader** passes: NVDA on Windows, VoiceOver on macOS.
4. Test **previous major versions** and macOS/Linux, or keep minimums at 153/156.
5. Publication inputs (all unknown, none invented): copyright holder, repository URL, website origin, maintainers (CODEOWNERS), private vulnerability reporting, conduct reporting route, store accounts and credentials. `pnpm release:validate --publish` lists them.
6. Recorded usability check (new user completes the demo in under two minutes) — not done.
