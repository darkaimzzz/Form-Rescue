# Architecture

Form Rescue is a Manifest V3 extension (Chromium service worker, Firefox event page), a static Astro website, and two shared packages. Everything runs locally; there is no backend.

## Components

| Component      | Code                                              | Responsibility                                                                                                                                              | Must not                                                                          |
| -------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Content script | `apps/extension/src/content`                      | Policy handshake, trusted-edit observation, metadata eligibility, debounce, transient value screening, descriptors, apply/verify/undo for authorized values | Store anything in page storage, expose drafts, run in frames or non-HTTP(S) pages |
| Background     | `apps/extension/src/background`                   | Sender authorization, policy/epoch checks, HMAC fingerprints, commits, candidate lookup, matching, recovery plans, registration reconciliation, pruning     | Rely on in-memory state for saved data                                            |
| Storage        | `packages/storage`                                | IndexedDB repository: atomic commits, revisions, epochs, limits, deletion, rules, migrations                                                                | Make network requests                                                             |
| Core           | `packages/core`                                   | Pure logic: classification, screening, schemas/limits, identity, matching, retention                                                                        | Touch browser globals                                                             |
| Popup          | `src/popup`                                       | Site control and honest save status                                                                                                                         | Render draft inventories                                                          |
| Pages          | `src/pages/{recovery,library,options,onboarding}` | Trusted previews, restore, library, settings, onboarding                                                                                                    | Send values to a page before confirmation                                         |
| Website        | `apps/website`                                    | Story, simulation, docs, install guidance                                                                                                                   | Access the extension or store any data                                            |

The browser adapter (`src/platform/browser.ts`) selects `browser` (Firefox) or `chrome`; both expose promise-based MV3 APIs. Browser differences are confined to that file and to the generated manifests (`scripts/build-manifests/manifest.mjs`).

## Capture flow

```text
user edits a field on an enabled page (trusted input/change event)
  → content: eligibility(metadata only) → buffer (300 ms trailing, 1 s max, flush on blur/hidden/route change)
  → flush: re-check eligibility, read value, 64 KiB check, secret screening (drop + purge)
  → runtime message {commit, capability, requestId, sequence, epoch, url, form, fields}
  → background: classifySender (tab, frame 0, http/s, not incognito) → schema + size check → rate limit
  → capability must match tab/origin/document; permission must still be granted
  → HMAC route/form/field fingerprints → storage.commitEdit (one strict-durability transaction:
     policy + epoch check, exclusions, site-wide purges, merge, revision, pointer, byte totals, eviction)
  → ack after commit → content state "saved" → popup shows "Saved locally at …"
```

## Recovery flow

```text
popup "Review drafts" → recovery page (extension origin)
  → recoveryCandidates: same origin + same route hash, excluding the tab's own session
  → planRestore: content "describe" (eligible current fields + fingerprints) → matchFields → plan kept in memory
  → user selects fields (populated fields need explicit replacement) → restore
  → background revalidates tab URL/route, capability, permission, epoch, draft expiry
  → content "apply": re-check eligibility + fingerprint (conflict if changed) → native setters + events
  → verify after next frame + 250 ms → outcomes → undo preimages kept in page memory only
```

## Lifecycle

Listeners are registered synchronously at worker start. The database and HMAC key load lazily. Capabilities and plans live in memory; a restarted worker answers `stale-capability`, the content script re-handshakes and retries with the same request ID and sequence, and the storage layer deduplicates by sequence. Registrations are reconciled on install, update and startup, and on Firefox at event-page start; enabled policies whose permission disappeared are disabled (and their drafts deleted unless a deliberate keep-drafts intent was recorded).

## Build

`apps/extension/scripts/build.mjs` runs Vite three times per target: React pages (no module-preload polyfill, which would need `fetch`), and the background and content scripts as single IIFE bundles. It then copies icons and writes the target manifest. `--e2e` writes to `dist-e2e` and adds fixture host grants plus User Timing instrumentation; neither is ever packaged (`pnpm package` refuses manifests with `host_permissions`, and the validator scans for the instrumentation).

Decisions are recorded in `docs/adr/`.
