# Changelog

All notable changes to Form Rescue are documented here. The project follows
[Semantic Versioning](https://semver.org/); see `docs/release.md` for how
versions map to browser manifest versions.

## [Unreleased]

Nothing yet.

## [0.1.0] (alpha, distributed as a developer build)

First public alpha of the extension, website and documentation.

### Added

- Per-site, opt-in protection: the toolbar popup requests access to one
  scheme + host only after a click; saving starts only after both browser
  permission and Form Rescue's own site policy allow it.
- Local capture of user-edited text areas, text inputs, opted-in search
  boxes, non-sensitive selects, checkboxes and radio groups, including
  dynamically inserted forms, React/Vue-controlled inputs, open shadow roots
  and fields outside `<form>` elements.
- Sensitive-field exclusion by metadata before any value is read, whole-form
  exclusion for password/OTP/payment/identity forms, and secondary screening
  of values for obvious secrets.
- IndexedDB storage with atomic commits, 3 revisions per draft, deletion
  epochs, retention (1/7/30 days, 7 default) and budgets (64 KiB per value,
  100 fields, 256 KiB per revision, 200 drafts, 20 MiB).
- Extension-owned review page with side-by-side comparison, conservative
  field matching, explicit replacement, conflict detection, copy fallback and
  in-memory undo.
- Draft library, settings (pause, retention, protected sites, delete all,
  diagnostic summary), onboarding, and field exclusion / search-box opt-in.
- Chromium (Chrome, Edge) MV3 service-worker build and Firefox MV3
  event-page build.
- Static website with interactive simulation, docs, privacy page and FAQ.

### Privacy and permissions

- Permissions: `storage`, `scripting`, `activeTab`, `alarms`, and optional
  `http(s)` host access requested per site. No telemetry or network use.
- Firefox manifest declares no data collection
  (`data_collection_permissions: { required: ["none"] }`).

### Compatibility

- Automated: Playwright Chromium 153, Microsoft Edge 153, Firefox 156 (smoke).
- Manual check of Google Chrome 153 and screen-reader passes are pending; see
  `docs/implementation-status.md`.

### Known limitations

- The newest ~1 second of typing can be lost in a crash or power failure.
- Drafts are not encrypted by Form Rescue.
- No `contenteditable`, iframes, file inputs or private windows.
