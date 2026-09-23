# ADR 0003: Permissions, origin policy, browser minimums

**Status:** accepted, 2026-09-24

**Decision.**

- Permissions exactly `storage`, `scripting`, `activeTab`, `alarms`; `optional_host_permissions` for `http`/`https`, requested per scheme + hostname from a popup click. No static content scripts.
- Site policy keyed by full origin including port, because match patterns cannot express ports.
- The popup skips `permissions.request` when it already knows access is granted (state fetched before the click). Enabling still requires the explicit click and a policy row.
- External revocation deletes the site's drafts unless a deliberate "disable and keep drafts" intent was persisted first (fails closed).
- Minimum versions are the oldest actually validated: `minimum_chrome_version: 153`, Firefox `strict_min_version: 156.0`.
- Firefox declares `data_collection_permissions: { required: ["none"] }`, matching the no-transmission contract.

**Alternatives.** `<all_urls>` or `tabs` (broader than needed); lower minimums taken from API docs without testing (the PRD forbids this).

**Consequences.** Older browsers can't install until testing widens support. A registered script may start on another port of an enabled host and is refused at handshake.
