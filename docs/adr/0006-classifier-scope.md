# ADR 0006 — Classifier scope

**Status:** accepted, 2026-09-23

**Decision.** Hard-exclude by type, state, autocomplete tokens and a multilingual term list. Exclude whole forms containing password/OTP/payment/identity-secret indicators, using a container-level label/legend scan that also keeps the first edit on a 200-control form under 50 ms. Contact terms apply only to single-line inputs, so prose fields aren't over-excluded; consent/payment terms apply only to checkboxes and radio groups. Short ambiguous tokens (pin, otp, ssn, pan, tin, sin…) need whole-token or context matches. Values that pass the metadata checks are screened for key/token formats and for checksum-validated card, IBAN, SSN, Aadhaar and PAN numbers; matches purge the field site-wide.

**Consequences.** Some false positives are accepted in favour of privacy (for example "Secretary notes" contains "secret"; 13–19 digit numbers that happen to pass Luhn). False negatives on sensitive prose are disclosed everywhere. No remote classification lists.
