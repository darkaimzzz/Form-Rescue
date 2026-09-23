# Permissions

Generated manifests: `scripts/build-manifests/manifest.mjs`. Verified by `pnpm release:validate`.

| Permission                                           | Reason                                                                                     | Constraint                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `storage`                                            | HMAC key and install state in extension-local storage                                      | Never `storage.sync`; drafts and policies live in IndexedDB |
| `scripting`                                          | Register (`registerContentScripts`) and inject (`executeScript`) the packaged `content.js` | Only for enabled hosts; no remote or main-world code        |
| `activeTab`                                          | Read the active tab's URL when the popup opens                                             | Not used for persistent protection                          |
| `alarms`                                             | Hourly opportunistic pruning                                                               | Pruning also runs on startup and use                        |
| `optional_host_permissions: https://*/*, http://*/*` | Persistent capture on enabled sites                                                        | Requested per scheme + hostname from the popup click        |

Also: `incognito: "not_allowed"`; CSP `script-src 'self'; object-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`; no `content_scripts`, `externally_connectable` or `web_accessible_resources`.

Not requested: `<all_urls>`, `tabs`, `history`, `cookies`, `webRequest`, `debugger`, `clipboardRead`, `clipboardWrite`, `downloads`, `nativeMessaging`, `unlimitedStorage`. Copying uses `navigator.clipboard.writeText` on a user click in extension pages; if unavailable, the UI says to select the text manually.

## Origin policy

Match patterns can't express ports, so the permission is `scheme://hostname/*`; Form Rescue's own site policy is keyed by full origin (scheme + host + port). A registered script may start on another port of the same host, but its handshake is refused. No automatic subdomain or HTTP→HTTPS expansion.

## Enable, disable, revoke

- **Enable:** popup click → `permissions.request` (skipped when the permission is already known to be granted) → `enableSite` → policy row + registration + injection into the current tab. Denial shows a retry.
- **Existing permission never enables a site** by itself; the background checks both policy and permission on every handshake and commit.
- **Disable:** policy disabled and epoch bumped first (drafts deleted unless "keep" was chosen, in which case a keep intent is recorded), live scripts told to stop, registration removed, permission removed if no other enabled origin shares the pattern.
- **External revocation** (`permissions.onRemoved`, or found missing at startup): disable, stop scripts, unregister, delete drafts unless the deliberate keep intent exists. Fails closed.

## Browser notes

Firefox MV3 treats host permissions as user-controlled and doesn't accept ports in match patterns. The Firefox manifest declares `data_collection_permissions: { required: ["none"] }` (see ADR 0003). Minimum versions are the oldest actually validated: Chrome/Edge 153, Firefox 156.

Any permission change requires an ADR, an update here, website docs, store disclosures and the changelog.
