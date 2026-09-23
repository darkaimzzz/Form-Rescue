# Threat model

## Assets

Draft values; the fact that a person wrote on a given site; site/field policies; the per-install HMAC key.

## Trust boundaries

1. **Web page ↔ content script.** Pages share the DOM but not the isolated world. Pages can change metadata, fire synthetic events, mimic forms and read anything restored into them.
2. **Content script ↔ background.** Only our own content scripts can message the extension (no `externally_connectable`). A content script is still treated as semi-trusted: it can submit edits and ask about its own status, never list or read drafts.
3. **Extension pages ↔ background.** Trusted UI on the extension origin.
4. **Extension ↔ disk.** IndexedDB in the browser profile, readable by anyone with profile access.

## Threats and mitigations

| Threat                            | Mitigation                                                                                                      | Evidence                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Accidental cloud disclosure       | No network code, `connect-src 'none'`, no sync storage, no telemetry                                            | ESLint rules; `release:validate` bundle scan; `privacy.spec.ts` network test          |
| Page scripts reading the library  | No messaging bridge, no web-accessible resources; values shown only on extension pages                          | `privacy.spec.ts` ("pages cannot reach the extension")                                |
| Routine sensitive-field capture   | Metadata classification before value reads; whole-form exclusion; value screening                               | `classification.test.ts`, `content-dom.test.ts` (throwing getters), `privacy.spec.ts` |
| Field becomes sensitive later     | Mutation observer rechecks touched fields; purge across revisions                                               | `privacy.spec.ts` dynamic purge                                                       |
| Unsafe matching / lookalike forms | Exact origin + route, form key gate, score ≥80 with 2 signals and 25-point margin, one-to-one, copy fallback    | `matching.test.ts`, `scenarios.spec.ts`                                               |
| Silent overwrite                  | Populated targets need explicit replacement; fingerprints detect changes after review                           | `recovery.spec.ts`                                                                    |
| Injected HTML in previews         | Values rendered as React text; bidi/control characters shown as markers                                         | `extension.spec.ts` (a11y) bidi check; lint rule against `dangerouslySetInnerHTML`    |
| Forged or oversized messages      | Discriminated strict schemas, size limit before parsing, sender-derived context, capability binding, rate limit | `authorize.test.ts`, `privacy.spec.ts` forged messages                                |
| Stale plans / navigation races    | Plans bound to tab, route hash, capability and epochs; revalidated before delivery                              | `scenarios.spec.ts` SPA stale plan                                                    |
| Deletion races / resurrection     | Epoch bump on delete/pause/exclusion; buffered writes rejected and dropped                                      | `storage.test.ts`, `scenarios.spec.ts`                                                |
| Permission revoked mid-write      | Permission rechecked per commit; `onRemoved` disables and deletes; startup reconciliation                       | `scenarios.spec.ts` revocation                                                        |
| Excessive retention               | Expiry by last edit, pruning on use/startup/alarm, hidden before pruning                                        | `retention.test.ts`, `storage.test.ts`                                                |

## Out of scope (disclosed)

Compromised OS or browser, malware with profile access, someone using the same unlocked profile, browser vulnerabilities, profile backups, and sensitive prose in ordinary fields. **No application-level encryption at rest**: a key stored next to the data would not justify vault claims. Fingerprints are keyed hashes to reduce accidental metadata exposure, not encryption.

After restoration the page can read restored values. Origin matching can't prove account identity; the review page tells the user so every time, and Form Rescue never reads cookies or account names.
