# Release process

## Versioning

Source releases use SemVer (`package.json`). Manifest versions must be numeric: `x.y.z` → `x.y.z`, prereleases `x.y.z-alpha.N` / `-beta.N` / `-rc.N` → `x.y.z.N` (Chrome also gets `version_name` with the SemVer string). The next prerelease must use a higher fourth component than any previously uploaded build, and a final release must be published as a _higher_ version than its prereleases (e.g. `1.0.0-rc.3` = `1.0.0.3`, so the final must be `1.0.1` or later if `1.0.0.x` was uploaded to a store). Keep the website `config.version` and `CHANGELOG.md` in sync; `release:validate` checks all three.

## Build and package

```sh
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration
pnpm test:e2e:chrome && E2E_CHANNEL=msedge pnpm test:e2e:chrome && pnpm test:firefox
pnpm test:a11y && pnpm test:performance && pnpm test:lighthouse
pnpm package            # build + release/*.zip, SBOM, licenses, SHA256SUMS.txt
pnpm release:validate   # manifests, bundles, ZIP contents, checksums, docs, versions
pnpm release:reproducible
```

Artifacts in `release/`: `form-rescue-<v>-chrome.zip` (Chrome and Edge), `form-rescue-<v>-firefox.zip`, `form-rescue-<v>-source.zip` (tracked files; Firefox source submission), `sbom.cdx.json` (CycloneDX 1.5), `third-party-licenses.json`, `SHA256SUMS.txt`.

ZIPs are written by our own deterministic writer (sorted entries, fixed 1980-01-01 timestamps, no extra fields). `pnpm release:reproducible` builds and packages twice from clean output directories and compares the checksums of the Chromium and Firefox ZIPs. Only call a build reproducible after that check passes in the pinned environment (Node 24 in CI). Store-signed packages will differ.

Build environment for the first packages: Windows 11, Node 26.5.1 locally (CI pins Node 24), pnpm 12.6.0, Vite 8.3.0, TypeScript 6.0.3.

## Configuration required before publication

| Input                             | Where                                                                          | Status                                |
| --------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- |
| Copyright holder                  | `LICENSE`                                                                      | **Unknown** — replace the placeholder |
| Repository URL                    | `PUBLIC_REPO_URL`, `VITE_FR_REPO_URL`                                          | **Unknown**                           |
| Website origin                    | `PUBLIC_SITE_ORIGIN`, `VITE_FR_WEBSITE_ORIGIN`                                 | **Unknown**                           |
| Store URLs                        | `PUBLIC_CHROME_STORE_URL`, `PUBLIC_EDGE_STORE_URL`, `PUBLIC_FIREFOX_STORE_URL` | Pending review/approval               |
| Maintainers                       | `.github/CODEOWNERS`                                                           | **Unknown**                           |
| Private vulnerability reporting   | `SECURITY.md`                                                                  | Not enabled                           |
| Conduct reporting route           | `CODE_OF_CONDUCT.md`                                                           | Not set                               |
| Store developer accounts and fees | Chrome Web Store, Microsoft Partner Center, addons.mozilla.org                 | Owner action                          |

`pnpm release:validate --publish` fails until every item above is set. Nothing here is invented.

## Publication workflow

1. Complete validation, update version and changelog, get maintainer review.
2. Tag a release candidate; run the actual Chrome, Edge and Firefox smoke below on the packaged ZIPs.
3. `release.yml` (manual, on a tag) builds, tests, packages and creates a **draft** GitHub release with artifacts.
4. Submit to stores only with explicit authority and owner credentials. Use listing text from `assets/store/listing.md`; re-check screenshot sizes, required fields and data disclosures against each store's current requirements immediately before submission.
5. Store review may reject or delay. Keep website CTAs on "developer build / store release pending" until a listing is live, then set its URL.
6. Deploy the website (`website.yml`) only to the configured host and environment. Preview builds are `noindex` and never replace production silently.
7. After approval: install from each listing, repeat the smoke, then update CTAs.

### Short smoke (per browser)

Enable on the practice page (grant prompt) → type → "Saved locally" → refresh → Review drafts → restore → text back. Then: login form not saved; disable site deletes drafts; deny the prompt on a second site → site stays unprotected with retry.

## Dependency exceptions

High/critical advisories need triage before release. Current state (`pnpm audit`, 2026-09-24):

- `tmp` (GHSA-52f5-9888-hmc6, GHSA-ph9p-34f9-6g65) and `uuid` (GHSA-w5hq-g745-h8pq): dev-only via `@lhci/cli`; fixed with `overrides` in `pnpm-workspace.yaml`.
- `extract-zip` (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3): dev-only via `@lhci/cli` → Lighthouse → Puppeteer's browser downloader; no patched version exists. Not exploitable in our use: Lighthouse runs against Playwright's already-installed Chromium via `CHROME_PATH`, so no archives are extracted. Ignored via `auditConfig.ignoreGhsas`; maintainers must re-approve this exception for each release. Nothing from this chain ships in the extension or website.

## Rollback and incident response

Stop promotion for data leakage, unsafe restoration, permission expansion or data corruption. Stores may not allow downgrades: ship a higher-version hotfix that disables the unsafe feature locally, preserving compatible data where safe. Test migration compatibility first. Communicate known impact; never ask users to upload drafts. The website can roll back independently.
