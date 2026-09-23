# ADR 0005 — Real-extension testing

**Status:** accepted, 2026-09-24

**Decision.**

- Chromium E2E uses Playwright's bundled Chromium (branded Chrome ≥137 ignores `--load-extension`) with a persistent profile. The same suite runs on installed Edge (`E2E_CHANNEL=msedge`).
- A separate **E2E build** (`dist-e2e`) pre-grants the fixture hosts, because automation can't click permission prompts, and compiles in User Timing instrumentation. It is never packaged: `package.mjs` refuses host grants and `release:validate` scans for the instrumentation.
- Revocation is exercised through the browser's own site-access control (`developerPrivate` on `chrome://extensions`).
- Worker suspension uses the "Stop" control on `chrome://serviceworker-internals`.
- Crash tests hard-kill the profile's browser processes after a clean first install.
- Firefox: Playwright's Firefox can't load extensions, so `tests/firefox/bidi-smoke.mjs` drives installed Firefox over WebDriver BiDi (`webExtension.install`, `-remote-allow-system-access`), pre-seeding the user's grant for the fixture hosts.
- Value-read instrumentation lives in jsdom unit tests, because page-world getter traps can't observe isolated-world reads.

**Consequences.** The real permission prompt (grant and deny) and branded Chrome remain manual checks, tracked as release blockers.
