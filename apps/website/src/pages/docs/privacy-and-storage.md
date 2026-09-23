---
layout: ../../layouts/Doc.astro
title: Privacy and storage
description: What Form Rescue stores, where, how long, which fields it never saves, and the honest limits.
---

The short version: drafts stay in this browser profile, nothing is uploaded, and there is no telemetry. The [privacy page](/privacy/) has the full statement.

## Where drafts live

Drafts are stored in the extension's IndexedDB database in your browser profile. Websites cannot read it, and the extension exposes no way for pages to ask for it. Presentation preferences and install state use the extension's local storage. Nothing uses browser sync.

## What is stored

- The values of fields you edited, when you edited them, and up to three recent versions per draft.
- The site's origin, so drafts appear only on that exact site.
- **Fingerprints**, not raw details: page addresses and field identifiers are stored as keyed hashes made with a random key created on your device. Labels are stored only as generic names such as "Text field 2".
- Settings: protected sites, field rules, retention, pause state.

## Fields that are never saved

Checked from metadata before the value is read:

- Password, hidden, file and button inputs; disabled, read-only, inert and invisible fields.
- Email, phone, URL, number, date/time, range and color inputs.
- `autocomplete` hints for passwords, one-time codes, usernames, payment, contact, address and birthday details.
- Names, ids and labels that indicate passwords, codes, tokens, API keys, secrets, recovery phrases, card or bank numbers, government IDs (for example SSN, Aadhaar, PAN, passport) or medical records — in several languages.
- Consent and payment choices in checkboxes and radio groups.
- Anything with `autocomplete="off"` or `data-form-rescue="off"` on the field, its form, or an ancestor.
- **Whole forms** that contain a password, one-time-code, payment or identity-secret field.
- Search boxes, unless you opt a specific search box in.

Values that pass those checks are screened for private keys, common access-token formats, card numbers (Luhn-checked), IBANs, SSNs, Aadhaar and PAN numbers. Matches are dropped, and any earlier saved copies of that field are deleted.

## The limits

- **Heuristics aren't perfect.** Private text typed into an ordinary message box can be saved. Keep protection off on sites where you write highly sensitive prose, or exclude the field.
- **Not encrypted by Form Rescue.** Anyone who can use your browser profile or read its files can read drafts.
- **Not a backup.** Uninstalling, clearing browser data, or losing the profile or device deletes drafts.
- **Deletion timing.** Expired and deleted drafts are removed from the database the next time the extension runs. It's not forensic secure erasure.

## Retention

Drafts expire 1, 7 (default) or 30 days after your last edit. Viewing or restoring doesn't extend that. Shortening the period deletes older drafts immediately; lengthening it never brings deleted drafts back.

## Limits on size

| Limit | Value | At the limit |
| --- | --- | --- |
| One text value | 64 KiB | Skipped with a warning, never shortened |
| Fields per draft | 100 | Extra fields skipped and reported |
| One version | 256 KiB | Save rejected with a visible status |
| Versions per draft | 3 | Oldest removed |
| Drafts | 200 | Oldest other draft removed |
| All drafts | 20 MiB | Oldest removed; if still full, the save fails visibly |

## Deleting

- One draft: **All drafts → Delete draft**.
- One site: **All drafts → Delete all drafts for …**, or disable the site and choose to delete.
- Everything: **Settings → Delete all drafts**. Form Rescue confirms the library is empty afterwards.

Deletion is permanent. Anything still waiting to be saved when you delete is discarded and can't reappear.
