# /goal

Build **Form Rescue**, a production-quality, open-source browser extension that saves eligible, user-edited form drafts locally and lets users deliberately recover them after refreshes, navigation, tab closure, browser crashes, or session expiry. Build its polished public website, documentation, demo assets, contributor experience, automated tests, and release tooling in the same repository.

Treat this document as the implementation brief. Complete the milestones in order, make ordinary engineering decisions autonomously, record material decisions, and verify each milestone before proceeding. Deliver working software and documentation, not only scaffolding or mockups. Never represent an untested capability, simulated demo, or unpublished store listing as real.

The heading `/goal` is a portable instruction section, not a claim that every Claude Code installation provides a built-in `/goal` command. Feed this file to Claude Code directly, or reference it from a goal command if one is installed.

**Suggested invocation:**

```text
Read Form-Rescue-PRD.md and implement its /goal in this repository. Follow its
milestones, privacy constraints, acceptance criteria, and completion protocol.
Make reasonable implementation decisions without routine clarification. Keep
docs/implementation-status.md current. Finish all locally achievable work;
report publication or credentials blockers separately with exact next steps.
```

**Definition of done:** all P0 requirements and release gates below are implemented, exercised, and documented; Chromium and Firefox packages build; Chrome, Edge, and Firefox validation is reported accurately; the website and docs build as static assets; README, licensing, contribution files, demo assets, and release workflows are complete. External publication is a separate, explicitly authorized step.

---

# Form Rescue, Product Requirements & Autonomous Build Specification

Version: 1.0 of the specification  
Prepared: 2026-09-23  
Initial product target: desktop browser extension v1.0, preceded by a Chromium alpha  
License decision: MIT for original code, documentation, and original assets  
Priority meanings: **P0** = required for v1.0; **P1** = useful follow-up; **P2** = explicitly deferred

## 1. Product intent and positioning

### 1.1 Problem

People lose long answers, support requests, application responses, and other unfinished writing when a website refreshes, navigates, signs them out, or fails. Browser autofill does not consistently preserve arbitrary draft text. Form Rescue provides a small, understandable safety net for writing on websites the user chooses to protect.

### 1.2 Product promise

> Get your words back. Form Rescue saves eligible drafts on sites you enable, in this browser profile, so you can recover them when a page lets you down.

Always qualify that promise with these boundaries:

- Saving starts only after site access is granted and capture is active.
- Only successfully committed drafts are recoverable. The final unsaved changes can be lost in an abrupt crash or power failure.
- Not every editor, field, frame, or website is supported.
- Recovery restores field content; it does not restore login sessions, server state, attachments, payment state, or submissions.
- Local storage is not a backup against uninstalling the extension, clearing browser data, profile loss, device loss, or disk corruption.

### 1.3 Users and primary jobs

| User | Job | Success |
| --- | --- | --- |
| Person completing a long application | Recover a written answer after a refresh | Preview and restore the committed answer without overwriting newer work |
| Person writing a support request | Recover after sign-in expires | Sign in normally, return to the form, choose a draft, restore |
| Person closing a tab accidentally | Find an earlier draft | Reopen the site manually, find the draft in the extension, restore or copy |
| Privacy-conscious user | Protect only chosen websites | See which sites are enabled, exclude fields, delete drafts, and verify no transmission |
| Open-source contributor | Understand, test, and improve recovery | Run fixture-based tests locally and contribute without access to real user drafts |

### 1.4 Success measures without analytics

Measure quality through synthetic fixtures, documented manual testing, opt-in user issue reports, and public release feedback. Do not add production analytics to calculate metrics.

- 100% of supported deterministic fixture recoveries restore the last acknowledged version.
- Zero sensitive-field fixtures persist or transmit excluded values through extension messaging.
- Zero automatic cross-origin or ambiguous-field restores.
- Zero extension-initiated network requests during capture, viewing drafts, and recovery.
- A new user can enable a site and complete the demo recovery in under two minutes in a recorded usability check.
- Local performance and accessibility gates in sections 12–14 pass.

## 2. Scope and explicit exclusions

### 2.1 P0 supported behavior

- Chrome and Edge desktop using Manifest V3; Firefox desktop using a browser-specific Manifest V3 background configuration.
- Per-site, opt-in protection. No broad site access requested during onboarding.
- Top-level HTTP(S) pages with supported controls, including forms inserted after page load.
- User-edited `textarea`, ordinary `input[type=text]`, eligible `input[type=search]`, non-sensitive native selects, checkbox and radio groups.
- Treat omitted input type as `text`; the exclusion rules still take precedence.
- Search controls require explicit per-field opt-in because many are transient search queries; omit routine site-search boxes by default.
- Open shadow-root controls when safely discoverable and tested. Document limitations around roots attached after initialization.
- Fields outside `<form>` elements using conservative, explicit virtual form grouping.
- Ordinary SPA forms, route changes, and framework-controlled native inputs through tested adapters.
- Local draft library, field previews, selective recovery, manual copy, per-draft deletion, per-site deletion, retention settings, global pause, site disable, and field exclusions.
- Supported recovery scenarios: refresh, back/forward navigation, return to a URL, reopened tab, normal browser restart, simulated process crash after acknowledged commit, and return to a form after login expiry.

### 2.2 P1 after v1.0

- Plain-text recovery for carefully tested `contenteditable` surfaces.
- Same-origin frame support with explicit frame identities and a separate security review.
- Additional framework/editor adapters supported by fixtures.
- Localization beyond the initial English release; architecture must already support translated strings.
- Optional encrypted export/import, designed separately with a threat model and migration policy.

### 2.3 P2 / out of scope

- Cloud accounts, synchronization, backend draft storage, telemetry, AI rewriting, paid tiers, ads, and affiliate tracking.
- Password manager behavior, OTP recovery, payment data recovery, recovering credentials or authentication sessions.
- Automatic restoration on load, automatic form submission, or bypassing site validation.
- Restoring uploads, file inputs, images, canvas editors, arbitrary rich text markup, iframe content, closed shadow roots, privileged browser pages, extension store pages, PDFs, or browser-internal viewers.
- Incognito/private browsing capture, mobile browsers, Safari, and cross-device recovery.
- Reading all existing filled fields on page load, scraping page text, recording keystrokes, monitoring clipboard contents, or capturing network requests.
- Guaranteed recovery of every character or every form. Never market these guarantees.

### 2.4 Product decisions and alternatives

Choose opt-in sites over blanket protection: less coverage initially, but permission intent is clear. Choose IndexedDB over one large serialized storage blob: atomic record updates and bounded revisions matter. Choose explicit extension-owned previews over in-page draft previews: hostile pages should not receive draft contents before a user authorizes restoration. Choose a static website over a backend app: installation, explanation, and documentation need no user accounts or server processing.

## 3. User experience

### 3.1 Onboarding

1. Open a first-run extension page with a short explanation: “Your drafts stay in this browser profile.”
2. Explain sensitive-field exclusions, seven-day expiry, and the final-unsaved-changes limitation in plain language.
3. Offer “Try the demo” and “Enable on a site.” Do not request every host or launch unrelated pages.
4. On a chosen ordinary page, the popup shows its hostname and “Enable protection for this site.” A direct user click requests only the matching scheme and host.
5. After permission is granted, register and inject the content script for that site. Display “Protection on, saving starts when you edit a supported field.”
6. Permission denial leaves the site unprotected with an explanation and a retry button; it is not an error loop.

Site consent and browser permission are separate checks. Existing permission alone must never enable a site that the user disabled in Form Rescue.

### 3.2 Popup

Target width 360–400 CSS px, with a layout usable in small browser popup windows and at zoom. Use an extension tab for the complete library and long previews.

Show:

- Site hostname, protection state, and a clearly named pause/enable action.
- Saving state: `Not enabled`, `Ready`, `Saving…`, `Saved locally at …`, `Paused`, `Unsupported page`, or `Couldn’t save`.
- A saved timestamp only after a durable database transaction completes.
- Number of eligible drafts for the current page, with “Review drafts.”
- Links to all drafts, site settings, privacy explanation, and help.

Do not claim “Saved” merely because an input event occurred. Distinguish “No eligible edits yet” from storage failures and excluded fields.

### 3.3 Draft library and recovery review

The library is an extension-origin page, not the public website. Group drafts by hostname; show last-edited time, an anonymous form label, number of fields, and expiry. Values remain collapsed until the user expands a draft. Avoid storing page titles or raw URL paths for convenience.

The user can filter by hostname and time. Full-text search is deferred. Library entries offer view, copy a selected field, delete draft, and delete all drafts for the site. Do not automatically open stored URLs because raw URLs are not retained.

From an active matching page, “Review drafts” opens an extension-owned recovery view:

1. Show candidate drafts, saved time, field types, and why each is or is not eligible for direct restoration.
2. Choose exactly one draft version. Never combine two independent tab drafts silently.
3. Show per-field saved and current values only in this trusted view, rendering plain text.
4. Select eligible fields. Empty text fields may be selected by default when identity confidence is high; populated text fields, selects, checkboxes, and radio groups start unchecked.
5. State “Restoring makes these values available to this website.”
6. For populated fields, require an explicit replacement selection; do not infer that the saved value is newer or better.
7. Press “Restore selected fields.” Revalidate the document and targets, then report restored, skipped, conflicted, and unsupported counts.
8. Offer an in-memory “Undo this restore” action while the same document is alive. Undo applies only if the target still equals the restored value; preserve subsequent edits.

Ambiguous fields offer manual copy in the trusted UI. They must not be applied to the page by a best-guess restore button.

### 3.4 Recovery notification

Use a toolbar badge or popup status as the default notification. No draft text in badges. An optional in-page chip can say only “Saved draft available” and direct users to the extension toolbar; do not make it an authoritative permission or restore interface. It must not obscure form fields, steal focus, imitate site controls, or contain saved values. Ship v1 without this chip if it introduces complexity.

### 3.5 Settings and destructive actions

- Global pause stops new capture and clears unsaved buffers; existing drafts remain available until expiry.
- Retention choices: 1 day, 7 days default, or 30 days. No indefinite retention.
- Reducing retention prunes immediately using `updatedAt + selected retention`; expanding it never resurrects deleted drafts.
- “Disable this site” stops capture and asks whether to delete existing drafts; default choice is delete. If the user keeps drafts, clarify that storage remains local until expiry.
- “Exclude this field” saves only an opaque locator rule and deletes saved instances matching that field across all revisions for the site. Changes to page structure may prevent rule matching; explain this limitation.
- “Delete all drafts” uses an accessible confirmation with the count. On success, immediately verify an empty library.
- No undo for permanent draft deletion. Do not keep hidden trash copies.
- Storage errors are persistent enough to notice, contain no form values, and offer retry/delete-old-drafts actions.

## 4. Privacy, sensitive fields, and threat model

### 4.1 Local-first contract

The extension runs entirely locally, requires no account, and contains no analytics, crash-reporting SDK, remote configuration, remote code, advertising, or draft sync. Store drafts, authoritative site/field policies, and deletion epochs in extension-origin IndexedDB so policy changes and deletion can be transactional. Store only presentation preferences and installation state in extension-local storage, never `storage.sync` or website storage.

The website is a separate static surface. It cannot read the extension database, and the extension exposes no external messaging bridge to it. Explicitly clicked help/store/GitHub links use the browser normally; those destinations may have their own logs. Browser update and store mechanisms are outside Form Rescue’s capture pipeline.

### 4.2 Threat model and honest limits

Protect against accidental cloud disclosure, page scripts querying the draft library, unsafe matching, injected HTML in previews, excessive retention, routine sensitive-field capture, forged extension messages, and race conditions that resurrect deleted data.

Do not claim protection against a compromised OS, malware with profile access, another person using the same unlocked browser profile, browser vulnerabilities, profile backups, or arbitrary sensitive prose entered into a generic field. Ordinary local storage is not an encrypted vault. Rely on browser origin isolation and the user's device controls; clearly disclose that v1 has **no application-level encryption at rest**. A key stored beside data would not justify claiming vault security.

After restoration, the destination page can read the restored value. A site can change ownership, users can switch accounts, and a malicious same-origin page can imitate a form. Origin matching is necessary but cannot prove account identity or trustworthiness. Require explicit user review every time. Do not read cookies or account names to guess identity.

### 4.3 Exclusion policy: before reading a field value

Run metadata-based eligibility checks before accessing `.value`, `.checked`, selected values, or serializing an edit. Re-run on every capture and again before restore. Eligibility precedence is: forbidden context → paused/disabled site → sensitive form context → field exclusion → supported control → trusted user edit.

**Hard-excluded, with no user override in v1:**

- Password, hidden, file, button, submit, reset, image inputs; disabled, read-only, inert, or non-visible controls.
- `autocomplete` tokens for passwords, one-time codes, username, credit card/payment details, transaction details, and personal contact/address/birthday information.
- `email`, `tel`, `url`, `number`, date/time-related, range, and color inputs in v1. This conservative choice favors prose recovery over general autofill.
- Credential, authentication, OTP, payment, banking, government identity, medical-record, and secret-bearing fields identified by normalized metadata.
- Form- or field-level `autocomplete="off"`; `[data-form-rescue="off"]` on the field or an ancestor; explicit user exclusion rules.
- Whole forms containing password/OTP/payment/identity-secret indicators, even when another field is named innocuously.
- Private/incognito contexts, non-HTTP(S) pages, all iframes, and browser-restricted pages.

**Classifier signals:** type, autocomplete tokens, id, name, associated label text, `aria-label`, referenced label text, placeholder, and limited nearest form/group labels. Read only this bounded metadata; do not scrape surrounding body text. Normalize Unicode and token boundaries. Include a documented multilingual baseline for sensitive terms and test false positives as well as false negatives. Examples include password, passcode, PIN, OTP, token, API key, secret, seed phrase, recovery code, SSN, national ID, Aadhaar, PAN, passport, routing number, IBAN, CVV, diagnosis, and medical record. Resolve ambiguous short tokens by context rather than substring matching every occurrence.

Never persist raw labels, identifiers, placeholders, or form actions. Metadata can itself contain private identifiers; store opaque fingerprints and generic labels such as “Text field 2.” A trusted preview may display current-page labels fetched for that interaction, then discard them.

**Secondary transient value screening:** after metadata checks pass, screen an eligible edited value in the content script for obvious credential blocks, private-key headers, common secret-token formats, and strongly structured payment/identity numbers. Drop suspicious values before messaging or persistence; delete older revisions for a newly excluded field. This cannot identify every secret or private fact. Do not claim that sensitive data can never be saved. Never log classifier inputs.

For privacy-sensitive websites that cannot be classified reliably, give users a site block control and clear advice to leave them disabled. Do not ship a remotely updated domain classification service.

### 4.4 Security implementation requirements

- Use isolated content scripts. No `window.postMessage` draft bridge, externally connectable manifest entry, main-world script injection, or web-accessible draft UI.
- Render all draft values as text, never HTML; no `dangerouslySetInnerHTML`, unsanitized markdown, or executable imported markup.
- Strict extension CSP using packaged scripts, with no inline JavaScript, `eval`, or remote code. Set `connect-src 'none'` for extension pages; additionally enforce and test the no-network contract in content scripts.
- Validate every message with a discriminated schema, reject unknown properties and oversized payloads, and authorize by message type and sender context.
- Content scripts can submit eligible edits and request their own save status/candidate counts. They cannot enumerate drafts or fetch arbitrary saved values.
- Only allow extension-owned UI to list/preview drafts, delete them, or request recovery.
- Derive tab/frame/document context from browser-provided sender information. Never trust a payload-supplied origin, draft ID, tab ID, or route alone.
- Since sender URLs may include SPA nuances, validate current tab URL immediately before recovery; bind actions to a background-issued document capability and reject stale capabilities.
- Use request IDs, monotonic sequences, bounded queues, and rate limits to prevent replay or flooding. An authorized content script still cannot read another site's drafts.
- Persisted data is untrusted on read: validate schemas, sizes, field types, timestamps, and version numbers.
- No sensitive content in logs, thrown error messages, issue diagnostics, screenshots, snapshots, recordings, or test artifacts. Use only synthetic fixtures.

## 5. Permissions and browser support

### 5.1 Permissions strategy

Baseline Chromium permissions:

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "scripting", "activeTab", "alarms"],
  "optional_host_permissions": ["https://*/*", "http://*/*"],
  "incognito": "not_allowed"
}
```

This is a fragment, not a complete manifest. Generate browser-specific valid manifests with name, version, icons, action, options page, background, and CSP.

| Permission | Reason | Constraint |
| --- | --- | --- |
| `storage` | Local presentation preferences and installation state | Never sync drafts; authoritative policies/epochs live in IndexedDB |
| `scripting` | Register/inject packaged capture scripts | Only explicitly enabled hosts |
| `activeTab` | Inspect current page during a toolbar action | Not a substitute for persistent site protection |
| `alarms` | Opportunistic retention cleanup | Never rely on exact alarm timing |
| Optional HTTP(S) hosts | Capture on enabled sites across reloads | Request a single scheme/hostname from a direct user gesture |

No required `<all_urls>`, `tabs`, `history`, `cookies`, `webRequest`, `debugger`, `clipboardRead`, `downloads`, `nativeMessaging`, or `unlimitedStorage`. If a target browser needs a variation, document it in an ADR and maintain equal-or-less exposure. Use user-initiated copy with the minimum API available; provide selectable text when clipboard writing is unavailable.

Browser host-match patterns may grant a broader scope than exact ports. Apply a stricter full-origin policy (`scheme + hostname + port`) inside the extension. No automatic subdomain or HTTP-to-HTTPS expansion. Explain any browser prompt mismatch in help.

Request access only from a user gesture, and handle withheld or revoked permissions. Register scripts at document start for granted sites, inject into the current tab after successful enablement, and prevent duplicate listeners. Reconcile registrations at installation/update/startup and permission changes. Persisted registrations alone must not authorize saving; each content script performs a policy handshake first.

Permission removal stops capture immediately, invalidates sessions, and removes registrations. Previously injected scripts cannot always be unloaded; send a stop message, clear buffers, and reject all future writes in the background. On external revocation, delete that site's stored drafts conservatively and explain the behavior in settings/help.

Distinguish user-selected “Disable and keep drafts” from an external permission revocation: persist an explicit internal removal intent before requesting permission removal, so the resulting browser event preserves drafts only for that intentional operation. On interruption or ambiguous intent, fail closed by deleting. Either path disables capture and invalidates outstanding writes immediately.

Reference: [Chrome optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions) and [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting). Verify behavior on the exact browser versions used for release.

### 5.2 Cross-browser plan

| Target | Required release state | Background |
| --- | --- | --- |
| Chrome desktop | P0 alpha and v1.0 | MV3 service worker |
| Edge desktop | P0 v1.0 smoke and recovery matrix | Chromium package, validate separately |
| Firefox desktop | P0 v1.0 | Firefox-supported MV3 nonpersistent background scripts/event page |
| Brave and other Chromium derivatives | Best effort only | No compatibility badge without testing |
| Safari/mobile/private browsing | Unsupported v1 | No install CTA implying support |

Do not assume Firefox accepts Chrome's service-worker background configuration. Use separate generated manifests and a small API adapter. See [MDN background manifest guidance](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background).

At implementation start, record actual stable versions and supported API minimums in `docs/browser-support.md`; test current and previous major desktop releases where installable. Set manifest minimums to the oldest actually supported and validated version. Do not invent a version matrix from memory or call Firefox tested because its build compiles.

Firefox manifests and submission material must accurately describe data collection/transmission, including applicable `browser_specific_settings.gecko.data_collection_permissions` requirements. Verify the current no-transmission declaration rather than assuming a Chrome manifest is sufficient. Reference: [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

## 6. Architecture and technology choices

### 6.1 Default stack

- TypeScript in strict mode, pnpm workspaces, an active Node.js LTS pinned at implementation time, one committed lockfile.
- Vite and React for extension-owned pages; lightweight plain TypeScript for content scripts. Bundle everything locally.
- A small typed WebExtensions API adapter or maintained polyfill, pinned and license-reviewed. Use native browser APIs beneath it.
- IndexedDB via a small maintained wrapper, with transaction semantics covered by tests. Avoid a general backend/database framework.
- Astro static output for the website and documentation; one small interactive island for the demo. Reuse plain design tokens, not the extension storage code.
- Vitest for logic, DOM-oriented tests where appropriate, Playwright persistent Chromium contexts for real extension E2E tests, `web-ext` lint/build and documented Firefox-specific browser validation.
- ESLint, formatting checks, axe-core accessibility checks, and Lighthouse CI for the website.

Use current stable compatible package versions when implementing; pin them. If a package is unsuitable, choose a maintained equivalent and record the reason. Do not let a framework generate broad host access or unsupported APIs unnoticed; inspect built manifests and bundles.

### 6.2 Components and responsibilities

| Component | Responsibility | Must not do |
| --- | --- | --- |
| Content script | Eligibility, user-edit observation, local debounce, field descriptors, apply authorized values | Store drafts in website storage or expose the library to a page |
| Background service | Authorize messages, apply policies, serialize commits, match candidates, prune data | Assume process memory survives lifecycle termination |
| IndexedDB repository | Atomic drafts/revisions, migrations, quotas, deletion | Make network requests |
| Popup | Site control and honest save status | Render large draft inventories |
| Library/recovery page | Trusted previews, explicit recovery, settings, deletion | Send values before the user confirms |
| Shared core | Pure classification, fingerprints, matching, schemas, retention | Depend on UI/browser globals |
| Website | Storytelling, simulated demo, docs, install links | Connect to real drafts or require extension access |

### 6.3 Data flow

```text
Trusted user edits an eligible control on an enabled site
  -> metadata eligibility and transient secondary screening
  -> capture buffer: field delta + document capability + sequence
  -> validated background message
  -> policy recheck + origin authorization
  -> one IndexedDB transaction: revision + pointer + size accounting
  -> acknowledgement after transaction completion
  -> popup may display Saved locally

User opens extension recovery view
  -> background finds same-origin candidates
  -> trusted UI requests preview and current-page descriptor comparison
  -> user selects fields and confirms
  -> background revalidates target document, route, origin, and permission
  -> only selected values delivered to that document
  -> content script rechecks eligibility/current state and applies
  -> verified field-level result returned to trusted UI
```

Register browser event listeners synchronously at background module startup. Initialize storage lazily behind those handlers. Persist authoritative state rather than relying on globals or keep-alive tricks; browser extension workers can stop when idle. See [Chrome service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

## 7. Capture and storage model

### 7.1 Capture rules

1. Obtain a policy handshake before observing values. A disabled site must never queue edits.
2. Listen to delegated trusted `input` and `change` events; use composed paths for supported open shadow roots. Do not record keydown or clipboard events.
3. Do not snapshot prefilled fields at boot or capture unrelated untouched controls when one field changes. Store only fields actually edited by the user.
4. Buffer eligible edits with a 300 ms trailing debounce and 1,000 ms maximum wait while the page remains active. Flush on blur/change and visibility hidden as best effort. Do not rely on unload/pagehide handlers for correctness.
5. Handle IME composition: avoid mid-composition commits, flush on composition end, and disclose that unfinished composition can be lost.
6. Use bounded mutation observers to notice additions, removed controls, and exclusion-related attribute changes. Never rescan the whole DOM on every keystroke.
7. Revalidate eligibility and route before reading, buffering, and sending. If a field becomes sensitive, clear its buffer and remove its saved values across revisions.
8. Represent user-cleared text, unchecked checkboxes, and empty selections explicitly; absence means untouched or unsupported, not empty.
9. Ignore the extension's own restoration events for capture, then resume on genuine user edits. Do not claim that every framework-generated synthetic event represents user input.
10. On SPA route changes, best-effort flush the old bucket and start a new route scope before subsequent edits. Derive route identity on every edit and restore, plus `popstate`/`hashchange`; no main-world history monkeypatching or continuous full-page polling.

### 7.2 Persistence schema

Use a versioned IndexedDB database, `form-rescue`, initially schema version 1. A transactionally maintained metadata record stores the total bytes and epochs. Example logical entities:

```ts
type FieldValue =
  | { kind: "text"; text: string }
  | { kind: "select"; values: string[] }
  | { kind: "checkbox"; checked: boolean }
  | { kind: "radio"; selectedOptionKey: string | null };

interface StoredField {
  fieldKey: string;            // opaque fingerprint, not a raw selector
  kind: FieldValue["kind"];
  identity: {
    stableIdHash?: string;
    nameHash?: string;
    labelHash?: string;
    groupHash: string;
    optionsHash?: string;
    ordinal: number;           // weak evidence only
  };
  genericLabel: string;
  value: FieldValue;
  editedAt: number;
}

interface Draft {
  id: string;                  // random ID per document/form editing session
  origin: string;              // exact origin; display hostname in library
  routeHash: string;           // includes path, query, and hash without storing them
  formKey: string;
  documentSessionId: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  latestRevisionId: string;
  status: "active" | "submission-attempted";
  schemaVersion: 1;
}

interface Revision {
  id: string;
  draftId: string;
  sequence: number;
  fields: StoredField[];
  committedAt: number;
  byteSize: number;
}
```

Stores: `drafts`, `revisions`, `sitePolicies`, `fieldExclusions`, and `metadata`. Index drafts by origin, `[origin, routeHash, formKey]`, updatedAt, and expiresAt; index revisions by draftId. Do not embed a whole database in a single settings object.

Generate a per-install random HMAC key using Web Crypto, kept in extension-local state. Use keyed hashes for route and metadata fingerprints, computed in the background from bounded transient descriptors; never persist those raw descriptors or log message payloads. Do not send this key to page contexts. These fingerprints reduce accidental metadata disclosure but are **not encryption** and do not protect against profile compromise.

Use the complete route components, including query and fragment, as hash input to avoid silently merging different document/account contexts. Do not drop query strings to increase match rate. Browser sender/tab checks authorize the origin; route descriptors alone grant no access to saved values. If browser-supported route verification is unavailable or differs from the current document, fall back to manual review/copy.

### 7.3 Limits and retention

| Limit | P0 value | Behavior at limit |
| --- | --- | --- |
| Retention | 7 days default; 1/7/30 options | Expire on time and prune opportunistically |
| One text value | 64 KiB UTF-8 | Skip with visible warning; never silently truncate |
| Fields per draft | 100 | Save within supported limit; report skipped count |
| One revision | 256 KiB serialized | Reject oversize update with clear save status |
| Revisions per draft | Latest 3 committed snapshots | Remove oldest transactionally |
| Total drafts | 200 | Evict oldest inactive draft first |
| Total draft data | 20 MiB serialized UTF-8 including revisions and indexes' logical metadata | Prune expired, then oldest inactive drafts; reject if still full |
| One incoming message | 320 KiB serialized | Reject before expensive parsing/processing |

The 20 MiB cap is an application budget, not a browser quota guarantee. Include policy metadata in bounded accounting; cap field exclusions and site entries to documented reasonable values (1,000 each). IndexedDB disk overhead may exceed serialized payload bytes; handle browser quota errors independently.

Expire drafts based on their latest eligible user edit, not when previewed or restored. Old revisions expire with their parent draft. Run cleanup before reads/writes, on startup, and using a periodic alarm; do not expose expired records even if physical pruning has not run. Closed browsers cannot execute cleanup. Explain that deletion occurs when the extension next runs and is not forensic secure erasure.

Do not evict the draft currently being updated to make its own save succeed. If every candidate is active, reject the new write and surface the problem. Support drafts created by different tabs independently, even for the same URL and form; never use last-writer-wins merging across tabs.

### 7.4 Atomicity, deletion, and migration

- Merge a field delta into the current draft snapshot and write its revision, pointer, counts, and byte totals in one transaction. Acknowledge only after commit, not request success.
- Per document/form sequences increase monotonically; duplicate requests are idempotent and older sequences cannot replace newer snapshots. Retries use the same request ID.
- On background restart, recover from IndexedDB and negotiate a fresh document capability. Never depend on a service worker variable for a saved draft.
- Global/site/field deletion increments an epoch and deletes applicable data transactionally. Pending writes carry their original epoch and are rejected after deletion. Broadcast buffer invalidation to live scripts.
- After deletion, only a new genuine edit under a fresh handshake may create a new draft. Previously buffered content must never reappear.
- Migration tests cover old fixtures, transaction rollback, interrupted startup, and unsupported future schema versions. Do not destructively reset the database as an error-recovery shortcut.
- If a migration cannot run safely, stop saving and show a repair/retry explanation. Do not export or upload user drafts for diagnostics.

## 8. Matching and recovery logic

### 8.1 Identity and candidate lookup

Fingerprint a real form using stable metadata hashes, same-origin action hash when present, ordered supported control signatures, and structural group identity. Never persist the action URL or use index position alone as identity. For virtual forms, prefer a stable nearest semantic container; otherwise treat independently edited controls as small separate groups instead of combining the entire page.

Lookup begins with exact origin and exact route hash. Rank exact form-key matches first. Same-origin drafts with route/form differences remain accessible in the library for manual copying only in v1. Cross-origin drafts must not appear as current-page candidates.

### 8.2 Deterministic field confidence

Apply strict gates before scoring: same target origin, route, document, supported kind, allowed field policy, compatible form/group, and option-set equality for selects/radio groups.

Suggested deterministic score, with deduplicated evidence:

- Unique stable ID hash match: +60.
- Unique field name hash within the form: +50.
- Associated label hash match: +25.
- Local structural/group signature match: +20.
- Relative ordinal match: +5.

Direct restoration requires score at least 80, at least two independent signals, and at least a 25-point margin over the next candidate. Unique ID and name that contain the same token count as one signal; labels that merely echo the same token also must not inflate confidence. Resolve a one-to-one assignment across the form; two saved fields cannot target one current field. Any tie, duplicate, changed option set, unsupported kind, or weak identity becomes manual copy only.

Treat these thresholds as the v1 baseline; adjust only with a recorded ADR and expanded adversarial fixtures. Preserve the no-guessing constraint.

### 8.3 Restore transaction

1. Trusted UI selects a draft/revision and requests a plan bound to a tab, origin, route, document capability, and current target-value fingerprints.
2. Re-read target descriptors for the plan, evaluate policy, and produce preview-only matches. Previewing does not mutate the page.
3. User confirms selected fields and any replacements.
4. Before delivery, recheck site permission, policy epoch, unexpired draft, and current tab/document/route. Abort on navigation, account-context uncertainty reported by the user, or a stale plan.
5. Content script rechecks each target's eligibility and compares the current value to the reviewed fingerprint. Changed targets are skipped as conflicts, even if the user previously selected replacement.
6. Apply supported native values with appropriate prototype setters and input/change events. Do not submit, click site buttons, invoke network requests, or patch page JavaScript internals.
7. Verify values on the next animation frame and after a short settling interval (up to 250 ms). Framework-rejected values are reported as failed with copy fallback.
8. Return field-level outcomes. Keep undo preimages in memory only for this document. They disappear after navigation, tab closure, or extension restart.

For radio groups, recover only an existing unique option fingerprint. For native selects, recover only existing exact option values with matching option-set signatures. Disabled options and consent/payment groups are ineligible. Saved HTML is never part of any value representation.

### 8.4 Submit and reset behavior

A `submit` event is an attempt, not proof of success. Mark the draft `submission-attempted` but retain it to normal expiry; do not inspect server responses or delete on navigation. Offer “Delete this draft” after submission. State that submitted information may remain locally until deleted or expired.

A reset event can be accidental; retain the last committed revision and do not immediately overwrite it with reset values. A deliberate later user edit starts a new revision. Programmatic resets and SPA responses do not imply success. Never restore automatically merely because a form became empty.

### 8.5 Failure scenarios

| Scenario | Required result |
| --- | --- |
| Refresh after save acknowledgement | Same-origin matching draft available |
| Crash before next commit | Earlier committed version available; unsaved changes may be lost |
| Session expired | No attempt to restore authentication; user signs in and returns |
| Switched account on same origin | Require explicit review; cannot infer account identity |
| Site redesign | Conservative matching or manual copy; no positional guessing |
| Permission revoked mid-write | Reject the write and purge according to revocation policy |
| Storage quota exhausted | Preserve committed drafts; expose failed-save state |
| Native browser autofill already restored text | Leave it untouched unless user explicitly chooses replacement |
| Multiple drafts from two tabs | Separate candidates with timestamps; no merge |
| Sensitive metadata added dynamically | Stop capture and purge saved values for that field/group |
| Draft deleted while a write is in flight | Epoch prevents resurrection |
| Background suspends | New event reinitializes state; committed data survives |

## 9. Public website specification

### 9.1 Design direction

Create an original, calm, premium visual identity inspired by broad Apple design principles: clarity, hierarchy, generous spacing, restrained color, careful typography, purposeful motion, and product-first storytelling. Do not reproduce Apple page layouts, navigation, product silhouettes, logos, iconography, slogans, proprietary assets, or trade dress. Do not distribute Apple fonts; a system font stack may naturally resolve to locally installed platform fonts.

Design concept: **a quiet safety net for your words**. Create an original “returning line” or folded-page mark with a subtle rescue loop; no Apple imagery. The visual centerpiece is an original browser/form demonstration showing text return after an interruption.

### 9.2 Design tokens

- Warm near-white base `#F7F8FA`, white surfaces, ink `#151A23`, muted text `#586170`, and deep teal accent `#006B5B` as starting tokens. Validate final contrast; these are direction, not permission to ship failing combinations.
- Optional dark mode: charcoal surfaces and appropriately lightened teal, with independently tested contrast.
- Typography: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; use an open-source self-hosted face only if its license is included and it materially improves the result.
- Heading scale using responsive `clamp`: hero roughly 44–80 px, section headings 30–48 px, body 17–20 px, documentation body at least 16 px. Avoid oversized type that truncates small viewports.
- Reading width about 65–72 characters; main layout max-width about 1120 px.
- Spacing tokens based on 4/8 px increments; section spacing 72–128 px desktop and 48–72 px mobile.
- Rounded controls around 10–14 px; feature/demo surfaces around 20–28 px. Subtle borders and a single restrained shadow system.
- Motion: 140–220 ms UI transitions; 350–600 ms demonstration sequences. Prefer transform/opacity; no scroll hijacking, parallax dependency, cursor effects, or infinite moving backgrounds.
- Respect `prefers-reduced-motion`: immediate state changes and optional static poster instead of essential animation. Users can pause/replay the demo.

### 9.3 Information architecture

Required routes:

```text
/
/demo/
/privacy/
/docs/
/docs/getting-started/
/docs/recovery/
/docs/privacy-and-storage/
/docs/permissions/
/docs/browser-support/
/docs/troubleshooting/
/docs/contributing/
/changelog/
/404.html
```

Use static output, real metadata, canonical URLs when a production origin is configured, social preview images, sitemap, robots file, favicon, and semantic Open Graph tags. Do not emit a fake production hostname. In preview builds, use `noindex` and omit unknown canonicals.

### 9.4 Homepage story and copy

1. **Header:** original mark and Form Rescue wordmark; Features, Privacy, Docs, GitHub; one primary install action. Mobile navigation uses an accessible menu with predictable focus behavior.
2. **Hero:** “Get your words back.” Supporting text: “Recover saved form drafts after refreshes, closed tabs, and interrupted sessions. Local to your browser. Open source.” Primary CTA “Install for [verified supported browser]”; secondary “Try the demo.” Small note: “Protect the sites you choose. Sensitive fields are excluded by default.”
3. **Product demonstration:** a large original form surface, interrupted state, then recovery review and restored text. Label simulation clearly. Keep enough whitespace for the product interaction to carry the story.
4. **Three-step explanation:** Enable a site → Write as usual → Review and recover. Show real extension UI captures once implemented.
5. **Feature sections:** Recovery after interruptions; choose what to restore; local draft history; site and field control. Use a small number of substantial sections rather than dozens of repetitive cards.
6. **Privacy section:** “Your drafts stay in this browser profile.” Explain no accounts, no uploads, no telemetry, excluded fields, expiry, and one-click deletion. Link to limits including unencrypted local storage and sensitive prose caveats.
7. **Compatibility and limits:** actual supported browsers and tested versions, native-field support, unsupported editors/private mode/mobile, last-unsaved-change limitation.
8. **Open-source section:** MIT license, source link, contribution invitation, build instructions. No fabricated stars, testimonials, ratings, install counts, or endorsements.
9. **FAQ:** clear answers below.
10. **Closing CTA and footer:** Install, GitHub, Docs, Privacy, License, Changelog, Report an issue, accessibility contact via the repo's issue path. Do not invent contact addresses.

Keep claims consistent with actual P0 scope. Do not use “never lose a word,” “works everywhere,” “100% secure,” “encrypted vault,” or “zero data collected” without distinguishing local processing and hosting logs.

### 9.5 Interactive demo

Implement a small accessible demo state machine: `ready → writing → interrupted → draft-review → restored`, plus `reset`.

- Use a synthetic support-message field with a prefilled example and an optional edit capability. Tell users not to enter private information.
- Store demo input in component memory only; no cookies, localStorage, IndexedDB, network calls, or analytics. Reloading the actual website clears the demo.
- “Simulate refresh” clears the visible simulated form but retains an in-memory draft. It does not actually refresh the browser.
- “Review saved draft” presents the synthetic saved text and a checkbox; “Restore” fills the simulated field.
- Label it “Interactive simulation, the real extension requires installation and site permission.”
- Provide a keyboard-operable step-through experience and a static transcript/poster for no-JavaScript users and reduced motion.
- Keep a real-extension demo fixture in the repository and record the actual extension recovering there. The marketing simulation is not evidence that the extension works.

### 9.6 FAQ requirements

Answer: What is saved? Which sites are protected? Are passwords saved? Can sensitive prose still be stored? Where are drafts stored? Are they encrypted? How long are drafts kept? Does it work offline? What happens after submission? Can it restore a login session? What if a website changes? Does it work in private browsing? What happens if I uninstall? Why does it need site permission? Can I recover an attachment? Why is my last sentence missing? Can a shared-computer user see my drafts? Is there telemetry? How can I build it myself?

Every answer must reflect this specification and tested implementation rather than broad marketing assumptions.

### 9.7 CTA configuration and release states

Centralize repository URL, production website origin, Chrome/Edge/Firefox store URLs, and release status in validated configuration. Do not scatter links across components.

- If a verified store URL exists, show the relevant install CTA.
- Before publication, show “Load the developer build” linking to real installation docs, and an honest “Store release pending” note.
- Browser detection may suggest a CTA but must not block manual browser selection.
- On unsupported/mobile browsers, show desktop instructions and GitHub; never a broken install button.
- In the initial repository, unknown owner/domain values may be explicit configuration inputs. Builds must handle absence gracefully. Publication validation must fail if required public links remain unknown.

## 10. Accessibility and localization

Target WCAG 2.2 AA for the public website and extension-owned UI. Treat automated checks as necessary but insufficient.

- Full keyboard access, visible focus, semantic buttons/landmarks, logical heading order, skip links on website/docs, and accessible names for every icon control.
- No focus theft when a draft is detected. Dialogs trap focus appropriately, close with Escape when safe, and restore focus to the opener.
- Status changes use restrained live regions; do not announce every keystroke or autosave.
- Text contrast at least 4.5:1 for ordinary text, 3:1 where WCAG permits large text; non-text controls/focus indicators meet required contrast.
- Controls should target 44×44 CSS px where feasible and satisfy WCAG target-size criteria. No hover-only access to recovery actions.
- Reflow at 320 CSS px and 400% zoom; support browser text enlargement. Avoid fixed-height previews that hide actions.
- Reduced motion, forced-colors/high contrast, dark mode if shipped, and long/unbroken strings are tested.
- Recovery comparisons identify saved/current values in text, not color alone.
- Preview dangerous bidi/control characters with a safe display strategy; preserve the actual stored value for deliberate copying/restoration without executing markup.
- English strings live in centralized catalogs. Use locale-aware dates and relative times with exact timestamps available. No string concatenation that prevents translation.
- Record manual NVDA on Windows and VoiceOver on macOS results when available. Missing platform checks remain explicitly unverified.

## 11. Repository and documentation

### 11.1 Required structure

```text
form-rescue/
├── apps/
│   ├── extension/
│   │   ├── src/background/
│   │   ├── src/content/
│   │   ├── src/popup/
│   │   ├── src/pages/{library,recovery,options,onboarding}/
│   │   ├── src/platform/
│   │   ├── manifests/
│   │   └── public/icons/
│   └── website/
│       ├── src/{pages,components,layouts,content,styles}/
│       └── public/{images,demos}/
├── packages/
│   ├── core/src/{classification,identity,matching,schemas,retention}/
│   ├── storage/src/
│   └── design-tokens/
├── tests/{unit,integration,e2e,fixtures,accessibility}/
├── scripts/{build-manifests,package-release,validate-release}/
├── assets/{brand,screenshots,recordings,store}/
├── docs/
│   ├── PRD.md
│   ├── architecture.md
│   ├── threat-model.md
│   ├── data-model.md
│   ├── permissions.md
│   ├── privacy.md
│   ├── browser-support.md
│   ├── testing.md
│   ├── release.md
│   ├── implementation-status.md
│   ├── third-party-notices.md
│   └── adr/
├── .github/
│   ├── ISSUE_TEMPLATE/{bug.yml,compatibility.yml,feature.yml,config.yml}
│   ├── workflows/{ci.yml,security.yml,release.yml,website.yml}
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── CODEOWNERS
│   └── dependabot.yml
├── CLAUDE.md
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── LICENSE
├── CHANGELOG.md
├── package.json
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

Merge/simplify folders if justified; do not create dozens of empty abstractions. Never place real drafts or browser profiles in the repo. Ignore local profiles, generated archives, secrets, and recordings containing personal content.

### 11.2 Required developer commands

Implement these commands and document their actual output locations:

```sh
pnpm install --frozen-lockfile
pnpm dev:extension:chrome
pnpm dev:extension:firefox
pnpm dev:website
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e:chrome
pnpm test:a11y
pnpm test:performance
pnpm build
pnpm package
pnpm release:validate
```

`build` creates Chromium and Firefox extension bundles and the static website; `package` produces unsigned distribution ZIPs plus checksums. Explain external browser installation/test requirements. Do not provide a fake Firefox E2E command that only tests a normal web page. When real-extension automation requires a different runner, add and document it honestly.

### 11.3 Great README requirements

README must have:

1. Original logo, a short useful tagline, and one real recovery GIF/video link with a static fallback and descriptive alt text.
2. One-paragraph problem/solution and a visible maturity badge such as alpha until release gates pass.
3. Working links to install/developer installation, live website when published, demo, docs, issues, and source license.
4. Feature list grounded in supported behavior and a candid limitations section near it.
5. Three-step getting started and Chrome/Edge unpacked/Firefox temporary-install instructions, including persistence caveats for development installs.
6. Privacy summary: local profile storage, no transmission/telemetry, sensitive-field heuristics, unencrypted storage, retention, deletion, uninstall effects.
7. Permission table explaining each permission and site opt-in.
8. Supported browser/version matrix and test status.
9. Contributor quick start with pinned prerequisites, commands, fixture demo, and expected builds.
10. Architecture overview linking to deeper docs.
11. Roadmap reflecting P1/P2, contribution/support links, private security reporting route, MIT license, and third-party notices.

Only show badges backed by actual workflows or metadata. No fake shields, star counts, coverage numbers, or “audited” claims. A reader should know in under 30 seconds what it does, where data goes, and how to try it.

### 11.4 Contribution and issue standards

- `CONTRIBUTING.md`: setup, repository map, coding style, tests, synthetic fixtures, branch/PR flow, accessibility, docs updates, and how to add a browser/field adapter safely.
- `CLAUDE.md`: concise architecture, commands, non-negotiable privacy rules, no real data in fixtures, scope boundaries, and verification protocol.
- `CODE_OF_CONDUCT.md`: an attributed established open-source code with a real maintainer reporting route; no invented mailbox. Configure it before public launch.
- `SECURITY.md`: supported release policy and GitHub private vulnerability reporting when enabled. Otherwise require a configured private route before launch; do not solicit vulnerability details in public issues.
- Use DCO sign-off for contributions and document it; no CLA for v1. Choose ordinary descriptive commits and require readable PR summaries, validation results, and risk notes.
- Bug template asks for extension/browser/OS versions, steps, expected/actual behavior, and a synthetic reproduction. Explicitly prohibit passwords, real drafts, private URLs, tokens, or unsanitized profile exports.
- Compatibility template asks for a minimized HTML fixture where possible, supported field type, and observed restore behavior. Real domains are optional.
- Feature template asks for the user problem, expected behavior, privacy implications, and alternatives.
- PR template includes privacy impact, permission changes, tests, accessibility, docs, screenshots using synthetic content, and migration considerations.
- Configure `CODEOWNERS` with actual repository maintainers during publication setup; unknown ownership must not be represented by fictional accounts.

### 11.5 Licensing and assets

Include the complete MIT license and actual copyright holder/year when repository ownership is known. Document the intended holder as a setup requirement until then; do not fabricate an identity. Original code, docs, and artwork use MIT unless a file explicitly states otherwise.

Inventory third-party dependencies, icon sets, fonts, and recordings in `docs/third-party-notices.md`; retain required notices. Prefer original SVG illustrations and icons or a permissive, attributed icon set. No Apple assets, copied competitor screenshots, proprietary stock imagery, or unlicensed music. Explain that the source license does not grant unrelated third-party trademarks.

## 12. Testing strategy

### 12.1 Unit and property tests

- Eligibility matrix for every supported/excluded input type and autocomplete token; ancestor/form-level exclusions; obfuscated or Unicode metadata; dynamic sensitivity changes.
- Instrument field-value getters in hard-excluded fixtures to throw: metadata rejection must occur without reading those values.
- Matching: unique and duplicate IDs/names, repeated labels, changed form order, inserted fields, collisions, one-to-one assignments, missing/changed options, route changes, and malicious lookalike forms.
- Property tests: cross-origin inputs never produce a restore plan; excluded controls never serialize; arbitrary draft strings render as text; malformed messages never gain extra capabilities.
- Value handling: Unicode, IME, multiline text, emoji, RTL, empty strings, null selections, size limits, and UTF-8 accounting.
- Retention, timestamps, clock changes, revision caps, eviction ordering, and deletion epochs.

### 12.2 Integration tests

- Real IndexedDB transaction success/abort, sequence ordering, duplicate requests, restart initialization, quota errors, migrations, deletion during pending commit, and stale acknowledgement handling.
- Policy handshake and permission grant/denial/revocation; live scripts continuing after unregister must be rejected.
- Background/content/UI sender authorization, arbitrary draft IDs, forged origin fields, replayed capabilities, stale document IDs, and oversized messages.
- Preview and restore plans cannot access different-origin records or mutate targets before confirmation.
- Forbidden plaintext sentinels must be absent from storage, message captures, logs, and test traces.

### 12.3 Real extension fixtures

Create a fixture server using at least two distinct test origins, multiple routes/query/hash identities, static forms, dynamically inserted forms, React-controlled and Vue-controlled native inputs, open shadow roots, repeated fields, native autofill-like prepopulation, blocked frames, checkout/login forms, and a synthetic logout/return flow.

Use controlled synthetic values only. Tests must enable the extension on fixture hosts through the real permission flow where automation supports it; otherwise separate the manual permission test from pre-granted E2E runs and label the distinction.

| Test | Expected evidence |
| --- | --- |
| Refresh after durable save | Exact saved revision recovered |
| Close/reopen tab | Draft available after manually revisiting fixture |
| Full browser restart with same profile | Committed draft remains |
| Force-kill browser after acknowledged save | Reopened browser recovers commit; crash harness documented |
| Force-kill before commit | No claim of exact last-character recovery |
| Navigate away/back and BFCache | No duplicate listeners, no accidental overwrite |
| SPA path/query/hash change | Separate draft scopes; stale restore blocked |
| Session timeout/login return | Only prose recovered; login fields never stored |
| Two tabs on same form | Two distinct drafts, no merge |
| Worker suspension/restart | No loss of acknowledged data |
| Revocation/delete during queued save | No resurrected data |
| Framework rerender after restore | Persistent state or explicit failure/copy fallback |
| Same-origin changed account fixture | Manual confirmation always required |
| Network observation during capture/recovery | No extension-initiated requests |

Playwright's ordinary Firefox engine is not by itself proof of Firefox extension support. Use a real installed Firefox extension workflow and record actual manual/automated evidence. External browser or OS limitations must remain visible in the status report.

### 12.4 Accessibility, website, and release tests

- Axe checks for popup, library, recovery, settings, website, docs, and every demo state; manually inspect keyboard/focus behavior.
- Website responsive checks at 320, 375, 768, 1024, and 1440 px, 200% and 400% zoom, reduced motion, and high contrast.
- Internal/external link validation with known external-network failures reported separately; no broken install links or fake production metadata.
- Production bundles checked for remote scripts, trackers, secrets, unsupported permissions, embedded sample credentials, and unexpected network APIs.
- ZIP inspection confirms manifest, icons, bundled assets, correct version, no test profiles, no source secrets, and no development-only host grants.
- At least 90% branch coverage for classification, matching, message authorization, and retention logic; prioritize meaningful cases over coverage padding. Do not require cosmetic component snapshot tests.

## 13. Performance and reliability budgets

These are release targets to measure, not claims already achieved. Publish the fixture, hardware, browser, and measurement method.

- A 200-control fixture adds no extension-attributable task over 50 ms during normal typing.
- Content capture handler p95 below 5 ms excluding asynchronous persistence on the reference machine.
- A settled eligible edit reaches committed acknowledgement within 1 second p95 in the normal local fixture run; no guarantee under OS/browser suspension.
- Idle content scripts have no repeating polling timer and generate no ongoing network activity.
- Site scanning is bounded and incremental; cap per-mutation work and yield between batches.
- Website first-load JavaScript budget at most 120 KiB gzip on the homepage, excluding lazily loaded optional video; demo island at most 60 KiB gzip additional.
- At most 500 KiB initial homepage transferred assets excluding user-initiated media; optimize images and avoid autoplay downloads.
- Lighthouse CI mobile median over three controlled runs: performance at least 90, accessibility at least 95, best practices and SEO at least 90. Manual accessibility gates still apply.
- Production field goals, if measured independently without adding analytics: LCP ≤2.5 s, CLS ≤0.1, INP ≤200 ms. Do not present lab results as real-user field data.

## 14. Telemetry and diagnostics policy

**P0 telemetry policy: none.** No anonymous analytics, install pings, remote logging, crash uploads, unique tracking IDs, or A/B testing. Do not add an opt-in telemetry toggle that hides an SDK in the bundle.

Offer “Copy diagnostic summary” only on explicit action. Show the exact text before copying. Include extension version, browser family/major version, schema version, generic capability flags, generic error codes, and aggregate storage size only. Exclude origins, URLs, titles, labels, field values, draft IDs, and full stack traces. Users paste it manually into an issue if they choose.

Public static hosting may retain HTTP access logs under the host's policy. Explain this separately on `/privacy/`, keep third-party embeds/trackers absent, self-host assets, and minimize retention where the configured host supports it. Do not add a cosmetic cookie banner when no optional cookies exist.

Any future telemetry proposal requires a separate public design discussion, explicit consent model, documented payload examples, and updated store/privacy disclosures; it is outside v1.

## 15. CI/CD and release process

### 15.1 Pull request CI

Use least-privilege GitHub Actions permissions, pinned action commits, dependency caching keyed to the lockfile, and `pnpm install --frozen-lockfile`. Do not run untrusted fork code with release secrets or use privileged `pull_request_target` for builds.

Required jobs:

1. Formatting, lint, strict type checks, and manifest validation.
2. Unit/integration tests and core branch coverage.
3. Chromium extension E2E including recovery/privacy fixtures.
4. Firefox lint/build validation; real Firefox validation separately tracked.
5. Website production build, link checks, accessibility, and Lighthouse budgets.
6. Dependency/security scanning, license inventory, secret scanning, and packaged-content checks.
7. Unsigned build artifacts for maintainers with limited retention and only synthetic traces.

Document which checks are branch-protection requirements. Network/tool outages may be classified as infrastructure failures; they are not silently green tests. Known high/critical vulnerabilities require triage and remediation before release or a documented, justified non-exploitable exception approved by maintainers.

### 15.2 Versioning and artifacts

Use SemVer source releases and browser-compatible numeric manifest versions. Map prerelease labels into a documented channel/version scheme accepted by each store; do not put invalid `1.0.0-beta.1` strings directly into unsupported manifest version fields.

Every release includes:

- Chromium ZIP and Firefox ZIP built from the tagged commit.
- SHA-256 checksums, source archive/link, dependency/license inventory and machine-readable SBOM.
- Changelog: user-facing changes, fixes, privacy/permission changes, compatibility, and migration notes.
- Build environment details and test matrix evidence.
- Store submission assets and notes, with Firefox source/build instructions where required.

Normalize archive ordering/timestamps where practical. Verify reproducibility by comparing two clean unsigned builds in the pinned environment; signed store packages may differ. Never label builds reproducible until that check succeeds.

### 15.3 Publication workflow

1. Complete release validation, update versions/changelog, and obtain maintainer review.
2. Create a release candidate from a known commit and run actual Chrome/Edge/Firefox smoke tests.
3. Prepare draft GitHub release, unsigned packages, checksums, and store submissions.
4. Submit/publish only with explicit authority and required store credentials. Do not invent account ownership, pay fees, buy a domain, or create external accounts autonomously.
5. Store review may be delayed or reject a package. Keep the website's verified status/links accurate per browser.
6. Deploy the static website only to the configured host and authorized environment; preview builds must not replace production silently.
7. After approval, verify listing links, install the distributed artifact, repeat the short recovery/privacy smoke, and update install CTAs.

Without credentials, finish packages, checksums, screenshots, listing text, and step-by-step handoff. Report “ready for submission,” not “published.”

### 15.4 Rollback and incident response

Stop promotion for data leakage, unsafe restoration, permission expansion, or data corruption. Prepare a higher-version hotfix disabling the unsafe feature locally; browser stores may not support version downgrades. Preserve compatible data where safe, communicate known impact, and avoid uploading users' drafts for investigation. Website deployments may roll back independently. Test migration compatibility before any rollback or hotfix.

## 16. Demo and launch assets

Produce original, synthetic assets from the working implementation:

- SVG brand mark and wordmark, browser icon PNG sizes required by each target, favicon, and 1200×630 social preview.
- A 20–35 second real extension recording: enable fixture site → type synthetic text → wait for saved status → refresh → review → restore. Include captions and a static poster; no music required.
- A short optimized GIF/WebP preview for README where useful, linked to a controllable full video. Avoid large autoplay media.
- Screenshots of onboarding, popup saved state, recovery review, library, privacy/settings, and the public site desktop/mobile.
- A synthetic sample page for contributors to replay the recording.
- Store listing copy: short description, detailed description, privacy explanation, permissions rationale, support link, category suggestion, and clear limitations.
- Validate exact screenshot sizes, required fields, and asset limits against each store immediately before submission; do not rely on stale dimensions.
- Include asset provenance, licenses, capture scripts/instructions, and alt text. No fabricated store badges implying approval.

## 17. Implementation milestones

Keep `docs/implementation-status.md` with requirement IDs, status, evidence paths, known limitations, and next action. Commit logically cohesive changes if working in an initialized repository; do not overwrite unrelated user work. Every milestone includes code, fixtures, tests, and documentation together.

### M0, Establish repository and feasibility evidence

Tasks:

- Inspect the repository and preserve existing work; initialize the workspace if empty.
- Copy this spec into `docs/PRD.md`; add `CLAUDE.md`, scripts, licenses, and the initial decision/status docs.
- Pin compatible tooling and verify clean dependency installation/build.
- Prove per-site permission request, dynamic script injection, IndexedDB commit acknowledgement, background restart, and a native textarea restore in Chrome.
- Build/lint the Firefox manifest and confirm its background strategy against current docs.
- Record a threat model, permission table, and browser support plan before adding broad capture.

Exit: minimal real extension works on a synthetic enabled site, disabled sites remain untouched, and clean builds run. This is a feasibility gate, not a marketing-ready alpha.

### M1, Safe capture and persistence

Tasks:

- Implement metadata classifier, transient value screening, opt-in policies, content event handling, bounded observers, and field/form fingerprints.
- Implement schemas, IndexedDB repository, revisions, limits, expiry, epochs, sequence checks, and migrations.
- Add permission revocation, incognito refusal, save status, and error handling.

Exit: supported edits persist and survive restart; all excluded-field and no-network tests pass; deletion cannot resurrect data.

### M2, Recovery and core UX

Tasks:

- Build popup, onboarding, library, trusted recovery review, settings, and per-site/field controls.
- Implement deterministic matching, explicit replacement, document revalidation, framework-native setters, results, copy fallback, and guarded undo.
- Cover route changes, multi-tab drafts, submission attempts, reset behavior, and storage failures.

Exit: full Chrome recovery matrix passes on fixtures; no automatic overwrite or ambiguous restoration; keyboard flows work.

### M3, Browser parity and hardening

Tasks:

- Complete Firefox adapter and packaged build; validate Edge separately.
- Run crash, suspension, adversarial metadata/message, quota, migration, accessibility, and performance checks.
- Fix behavior differences or document truthful unsupported cases without dropping P0 browser support silently.

Exit: browser evidence matrix complete for available environments; untested required environments remain explicit release blockers.

### M4, Website, docs, and assets

Tasks:

- Implement original visual identity and responsive static website with all required routes.
- Implement honest in-memory demo and accessible fallback.
- Produce real screenshots/recording and finish README, privacy, permissions, troubleshooting, support, and contribution docs.
- Configure truthful prelaunch CTAs; validate links, budgets, keyboard behavior, and mobile/zoom layouts.

Exit: production website build is polished and usable, no fabricated claims/links, and docs match the extension.

### M5, Release candidate and handoff

Tasks:

- Complete CI workflows, issue/PR templates, license inventory, SBOM, reproducibility check, packages, and checksum generation.
- Run all acceptance gates from a clean checkout; produce a release report.
- Prepare store listing assets and explicit maintainer publication instructions.
- Publish only if separately authorized and credentials are present; otherwise deliver a complete release-ready handoff with external blockers.

Exit: all locally achievable work is complete, required unmet gates are visible, and package/status claims match evidence.

## 18. Acceptance criteria and traceability

| ID | Requirement | Passing evidence |
| --- | --- | --- |
| FR-01 | Site opt-in and minimal permissions | Fresh-install and permission denial/revocation tests; built manifest audit |
| FR-02 | Eligible user edits saved locally | Durable commit test; database inspection with synthetic data |
| FR-03 | Sensitive exclusions precede value reads | Throwing-getter fixtures plus absence of sentinels in messages/storage |
| FR-04 | Recovery after refresh/tab close/navigation | Real extension E2E across supported fixtures |
| FR-05 | Crash/restart durability | Forced-process termination after ack and persistent-profile restart evidence |
| FR-06 | Session-loss scope is honest | Logout fixture restores prose after normal sign-in, never credentials |
| FR-07 | No automatic overwrite | Existing-value conflict and pre-confirmation non-mutation tests |
| FR-08 | Matching is conservative | Ambiguity, duplicate, shifted-layout, and route mismatch cases require copy |
| FR-09 | Origin/document isolation | Cross-origin/stale-document/forged-message tests reject access |
| FR-10 | Local retention/deletion | Expiry, revisions, quota, in-flight deletion and no-resurrection tests |
| FR-11 | Browser parity | Chrome, Edge, Firefox builds plus separately recorded runtime matrix |
| FR-12 | Honest status and error handling | Saved only after commit; quota/revocation failures visible |
| FR-13 | Zero telemetry/transmission | Bundle review and network-observed capture/recovery runs |
| FR-14 | Accessible extension and website | Automated report plus keyboard, zoom, reduced-motion and screen-reader checks |
| FR-15 | Website quality and storytelling | All routes/sections, responsive captures, working demo, performance results |
| FR-16 | Truthful install and source CTAs | Verified links or explicit prelaunch developer-install state |
| FR-17 | Contributor-ready open-source repo | Clean-checkout commands succeed; README/contribution/security/license review |
| FR-18 | Release-ready distribution | Validated ZIPs, checksums, SBOM, version alignment, listing assets and release report |
| FR-19 | Sensitive-data limits disclosed | UI/privacy/README mention heuristic limits and unencrypted local storage |
| FR-20 | Tested implementation, not mocks | Real extension fixtures and recording distinct from website simulation |

**Release stop conditions:** excluded secrets persisted; drafts sent to a server; saved values accessible to arbitrary pages; cross-origin or ambiguous restore; silent overwrite; data resurrection after deletion; undisclosed broad permissions; broken retention; fabricated test/browser claims; real user data in assets; missing required licensing; or unresolved required-browser verification.

## 19. Launch checklist

### Product and security

- [ ] All P0 acceptance criteria pass with evidence.
- [ ] Capture is off until the site is explicitly enabled.
- [ ] Private mode, frames, sensitive fields, and unsupported surfaces are excluded.
- [ ] Sensitive metadata/value fixtures never reach persistent storage or logs.
- [ ] Restore requires trusted UI confirmation and revalidates the target document.
- [ ] No telemetry, network draft traffic, remote code, or accidental sync storage.
- [ ] Retention, per-field/site/global deletion, permission revocation, and quota behavior verified.
- [ ] Threat model and known limitations match the final implementation.

### Browser and experience

- [ ] Actual release-candidate packages exercised in Chrome, Edge, and Firefox.
- [ ] Crash-after-ack, session-loss, multi-tab, SPA, and controlled-input recovery checked.
- [ ] Keyboard, screen reader, reduced motion, high contrast, and zoom findings resolved or clearly tracked as blockers.
- [ ] Save status never promises uncommitted content.
- [ ] Website/demo/README screenshots match the shipped UI.

### Repository and distribution

- [ ] Clean checkout builds and tests with documented prerequisites.
- [ ] CI checks, branch protections, ownership, private security reporting, and contributor conduct routes configured.
- [ ] MIT copyright identity and all dependency/asset notices finalized.
- [ ] README, docs, changelog, issue forms, and contribution guide complete.
- [ ] Packages, checksums, source build instructions, SBOM, and release notes generated.
- [ ] Store data/permission disclosures and asset requirements verified immediately before submission.
- [ ] Owner-controlled credentials and explicit publication authorization obtained when publication is requested.

### Website and launch truthfulness

- [ ] Production domain/repository links configured; no example URLs shipped as real links.
- [ ] Store CTAs point only to approved live listings; pending stores use honest developer-install messaging.
- [ ] Demo explicitly labeled simulation; real extension demo separately available.
- [ ] FAQ covers final-unsaved-change, uninstall, private-mode, sensitive-prose, encryption, and account-switch limits.
- [ ] No fabricated testimonials, user counts, security audits, browser support, or performance claims.
- [ ] Post-publication install smoke test completed from each distributed listing.

## 20. Autonomous execution and completion protocol

Use this PRD as the default decision source. Prefer the smallest maintainable implementation satisfying the requirements. Avoid speculative plugins, custom crypto, generic form frameworks, hidden servers, overbroad permissions, and unnecessary abstraction.

When a routine detail is unspecified, select a sensible accessible default and record consequential choices in an ADR. Ask for clarification only when a decision materially changes privacy, required scope, ownership, irreversible external actions, or licensing. Do not stop for ordinary choices such as component names, spacing, or test fixture names.

Unknown repository owner, domain, store IDs, credentials, and publication authority are legitimate external inputs. Keep the local app/website usable without them, list them in a configuration checklist, and block only the publication steps that depend on them. Never invent these values or leave inert install buttons pretending to work.

At the end, deliver:

1. What was implemented and which milestones/requirement IDs passed.
2. Exact install/run/build/test commands and artifact paths.
3. Browser/OS versions actually tested and unverified required environments.
4. Test, accessibility, performance, privacy, and package-validation summaries with evidence paths.
5. Known limitations, defects, and remaining release blockers.
6. A concise publication handoff with required configuration/credentials and prepared assets.

Do not mark the overall goal complete when a required implementation or verification gate is outstanding. It is acceptable to mark “local implementation complete; publication pending” only when that distinction is accurate. Do not claim store publication, audits, runtime support, recovery success, or test passes without direct evidence.

## 21. Primary reference links and verification policy

The requirements above are product decisions. These official sources inform browser API details; re-check them at implementation and submission time because APIs and store requirements can change.

- [Chrome optional permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions): request permissions from a user gesture and handle runtime access changes.
- [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting): packaged script injection and dynamic registration.
- [Chrome extension service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle): persist authoritative state outside worker globals.
- [MDN browser extension background configuration](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background): browser-specific background architecture.
- [Firefox built-in consent for data collection and transmission](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/): current Firefox manifest/submission consent requirements.

These sources were checked while preparing the specification on 2026-09-23. This document specifies work to build and verify; it is not evidence that Form Rescue has already been implemented or released.
