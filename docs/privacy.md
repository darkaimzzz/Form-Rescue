# Privacy

User-facing version: `apps/website/src/pages/privacy.astro` and `/docs/privacy-and-storage/`. This file is the engineering reference.

## Contract

- Local only. No accounts, backend, sync, analytics, crash reporting, remote configuration, remote code, advertising or tracking identifiers.
- Drafts, policies, rules and epochs in extension-origin IndexedDB; HMAC key and install state in extension-local storage.
- Capture only on enabled sites, only user-edited supported fields, only trusted input/change events. No keystroke logging, clipboard monitoring, page scraping or network capture.
- The website is static; it can't read extension data and there is no messaging bridge.

## Sensitive data handling

Eligibility precedence: forbidden context (frame, non-HTTP(S), incognito) → paused/disabled site → sensitive form → opt-outs/exclusions → supported control → trusted edit.

Metadata classifier (`packages/core/src/classification`):

- Hard-excluded types: password, hidden, file, button, submit, reset, image, email, tel, url, number, date/time family, range, color.
- State: disabled (incl. fieldset), read-only, inert, not rendered.
- `autocomplete` tokens: `off`, `current-password`, `new-password`, `one-time-code`, `webauthn`, `username`, `cc-*`, `transaction-*`, name tokens, `email`, `impp`, `tel*`, address tokens, `postal-code`, `country`, `bday*`, `sex`.
- `data-form-rescue="off"` on the field or any ancestor (crossing open shadow roots); `autocomplete="off"` on the form.
- Term list over id, name, label, aria-label/labelledby, placeholder, group label (bounded to 200 chars, NFKD-normalized, camelCase split, simple leetspeak): credentials in 14 languages, OTP/2FA, tokens/API keys/secrets/seed and recovery phrases/PIN, payment and banking, government IDs (SSN, national ID, Aadhaar, PAN with context, passport, tax ID, TIN/SIN with context, NIF, DNI, CURP, CPF, personnummer), medical records. Short ambiguous tokens match whole tokens or need a context token.
- Contact terms (email, phone, address, birthday, names, login) apply to single-line inputs only, so prose fields such as "Message for our phone team" stay eligible.
- Consent/payment/billing terms exclude checkboxes and radio groups.
- Whole-form exclusion if any control is a password, OTP, `cc-*` or secret-term control, or any label/legend in the container carries secret terms.

Transient screening (content script, before messaging): private-key headers, AWS/GitHub/Slack/Stripe/OpenAI-style/Google API tokens, JWTs, `password=`-style assignments, Luhn-valid card numbers, US SSNs, Verhoeff-valid Aadhaar numbers, mod-97-valid IBANs, Indian PAN. A match sends a purge instead of the value; saved copies of that field are deleted across the site's revisions.

**Limits:** heuristics cannot recognize every secret or private fact. Sensitive prose in ordinary fields can be stored. There is no application-level encryption. Deletion is logical deletion in IndexedDB, not secure erasure.

## Diagnostics

Settings → Diagnostic summary: version, browser family/major, schema version, pause state, retention, counts, KiB used, storage error code. No origins, URLs, labels, values, IDs or stack traces. Shown before copying; never sent.

## Website

Static hosting may keep HTTP access logs under the host's policy. No cookies, analytics, trackers or third-party embeds; assets are self-hosted. The demo keeps text in memory only (tested: no local/session storage or cookies).
