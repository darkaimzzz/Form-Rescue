# Security policy

## Supported versions

Form Rescue is in alpha. Only the latest released version receives security fixes. Browser stores may not allow downgrades, so fixes ship as a higher version (see `docs/release.md`, "Rollback and incident response").

## Reporting a vulnerability

Report vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** (https://github.com/darkaimzzz/Form-Rescue/security/advisories/new). Only the maintainer, @darkaimzzz, can see these reports.

Please don't put vulnerability details in public issues.

Please include: affected version and browser, a synthetic reproduction, impact, and whether it's known publicly. **Never include real drafts, credentials, private URLs or profile exports.**

## Scope

In scope: saved values reachable by web pages or other extensions, sensitive fields being stored, cross-origin or ambiguous restoration, data resurrection after deletion, network transmission, permission escalation, message forgery, unsafe rendering of stored values.

Out of scope (documented limitations): a compromised OS or browser profile, malware, someone using your unlocked profile, lack of encryption at rest, heuristic misses on sensitive prose typed into ordinary fields. See `docs/threat-model.md`.

## Response

Maintainers aim to acknowledge reports within 7 days, share an assessment within 30 days, and credit reporters who want credit. Releases are stopped for data leakage, unsafe restoration, permission expansion or data corruption.
