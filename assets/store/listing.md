# Store listing copy (prepared, not submitted)

Re-verify every field, character limit, screenshot size and data-disclosure question against each store's current requirements immediately before submission. Nothing here has been submitted or approved.

## Name

Form Rescue

## Short description (≤132 characters)

Recover form drafts after refreshes, closed tabs and expired sign-ins, on sites you choose, stored only in your browser.

## Detailed description

Lost a long answer to a page refresh, a closed tab or an expired sign-in? Form Rescue is a small safety net for writing on the websites you choose.

• Protect only the sites you pick. Form Rescue asks for access to one site at a time, when you click "Enable protection for this site".
• Write as usual. About a second after you pause, your draft is saved in this browser profile. The popup only says "Saved" once it really is.
• Review and recover. After an interruption, open Review drafts, compare what was saved with what's on the page, and restore the fields you choose. Nothing is restored automatically, and existing text is only replaced if you say so.
• Conservative by design. If a field can't be matched with confidence, you get a copy button instead of a guess. You can undo a restore.
• Your drafts stay local. No account, no uploads, no analytics or telemetry.
• Sensitive fields are skipped: passwords, one-time codes, payment, bank and identity fields, and whole forms that contain them.
• Drafts expire after 7 days by default (1 or 30 available). Delete one draft, a site's drafts, or everything at any time.

Limits: detection of sensitive fields is heuristic, so private text typed into an ordinary message box can still be saved. Drafts are not encrypted by Form Rescue. The newest second of typing can be lost if the browser crashes. Rich-text editors, iframes, file uploads and private windows aren't supported. Uninstalling deletes all drafts.

Open source (MIT).

## Privacy explanation (for privacy practices / data disclosure forms)

Form Rescue does not collect, transmit or sell any data. Drafts and settings are stored locally in the extension's storage in the user's browser profile and never leave the device. There are no accounts, servers, analytics, crash reports or remote code. The Firefox manifest declares `data_collection_permissions: { required: ["none"] }`.

Store data-type answers (verify wording per store): website content (form text the user types) is **handled locally only, not collected or transmitted**; no personally identifiable information, health, financial, authentication, personal communications, location, web history or user activity is collected.

## Permission justifications

- **storage**: keeps the extension's install state and a random local key used to fingerprint page addresses. Drafts themselves are stored in the extension's local database.
- **scripting**: runs Form Rescue's packaged script only on the sites the user enables, to save and restore form fields.
- **activeTab**: lets the popup show which site is open when the user clicks the toolbar button.
- **alarms**: periodically deletes expired drafts.
- **Optional host access (http/https)**: requested for a single site only when the user enables protection for it; needed to save drafts on that site across page loads.

Single purpose: save and restore form drafts on user-enabled websites.

## Category suggestion

Productivity (Chrome Web Store, Edge Add-ons); Privacy & Security or Other (addons.mozilla.org, choose per current category list).

## Support link

https://github.com/darkaimzzz/Form-Rescue/issues

## Screenshots

Captured from the real extension on synthetic fixture pages (`pnpm assets:capture`) in `assets/screenshots/`:

| File | Size | Alt text |
| --- | --- | --- |
| `recovery-review.jpg` | 1200×900 | Review drafts page showing saved text beside empty fields and restore checkboxes |
| `popup-enable.jpg` | 760×640 | Popup on a synthetic site: Not enabled, Enable protection for this site |
| `popup-saved.jpg` | 760×640 | Popup: Protection on, Saved locally at a time, 1 saved draft |
| `restored.jpg` | 760×640 | Result: Restored 2 fields, with an Undo button |
| `library.jpg` | 1200×900 | Saved drafts library grouped by site with values expanded |
| `settings.jpg` | 1200×900 | Settings: pause, retention, protected sites, delete all, privacy, diagnostics |
| `onboarding.jpg` | 1200×900 | First-run page: your drafts stay in this browser profile |

Store screenshot dimensions differ (for example 1280×800 or 640×400 for Chrome Web Store at the time of writing); re-capture at the exact required sizes before submission. Promo tile: derive from `assets/brand/social-preview.png`.

## Firefox source submission

Upload `release/form-rescue-<version>-source.zip` with instructions: Node 24, pnpm 12, `pnpm install --frozen-lockfile && pnpm --filter @form-rescue/extension build` → `apps/extension/dist/firefox`.
