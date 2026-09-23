# Data model

Database `form-rescue`, schema version 1 (`packages/storage/src/index.ts`). Records are validated with zod on every read (`packages/core/src/schemas/stored.ts`); invalid records are skipped, never shown and never bulk-deleted.

## Stores

| Store             | Key      | Indexes                                                                                                                             | Contents                                               |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `drafts`          | `id`     | `origin`, `route [origin, routeHash, formKey]`, `session [origin, documentSessionId, routeHash, formKey]`, `updatedAt`, `expiresAt` | One per document session × route × form                |
| `revisions`       | `id`     | `draftId`                                                                                                                           | Up to 3 snapshots per draft                            |
| `sitePolicies`    | `origin` | —                                                                                                                                   | `enabled`, `epoch`, `keepDraftsOnRemoval`              |
| `fieldExclusions` | `id`     | `origin`                                                                                                                            | Opaque field rules: `exclude` or `include-search`      |
| `metadata`        | `"meta"` | —                                                                                                                                   | `globalEpoch`, `totalBytes`, `retentionDays`, `paused` |

Extension-local storage holds only the HMAC key (`hmacKey`) and install state (`onboarded`).

## Records

```ts
Draft    { id, origin, routeHash, formKey, documentSessionId, createdAt, updatedAt, expiresAt,
           latestRevisionId, lastSequence, status: "active" | "submission-attempted", byteSize, schemaVersion: 1 }
Revision { id, draftId, sequence, fields: StoredField[], committedAt, byteSize }
StoredField { fieldKey, kind, identity { stableIdHash?, nameHash?, labelHash?, groupHash, optionsHash?, ordinal },
              genericLabel, value, editedAt }
FieldValue = text{text} | select{values[]} | checkbox{checked} | radio{selectedOptionKey|null}
```

No raw URLs, titles, labels, names, ids, placeholders or form actions are stored. `routeHash`, `formKey`, `fieldKey` and identity hashes are HMAC-SHA-256 (truncated, base64url) using a random per-install key. `routeHash` covers path, query and fragment. id/name/label use one token domain so matching can tell when they carry the same token.

## Invariants

- One `commitEdit` transaction (strict durability) checks pause state, site policy and both epochs, applies exclusions and site-wide purges, merges the delta, writes the revision, trims to 3 revisions, updates the draft pointer and `totalBytes`, and evicts the oldest _other_ drafts if over budget. The acknowledgement is sent only after the transaction completes.
- `sequence ≤ lastSequence` → `duplicate`: idempotent, never replaces a newer snapshot.
- Explicit empties are stored (`""`, unchecked, no selection). An absent field means untouched.
- Deletion (draft/site/all), pausing, disabling and exclusion bump an epoch; writes carrying an older epoch are rejected.
- Effective expiry = `min(expiresAt, updatedAt + retentionDays)`; timestamps more than a day in the future are treated as expired.

## Limits

64 KiB per text value (UTF-8), 100 fields per draft, 256 KiB per revision, 3 revisions per draft, 200 drafts, 20 MiB total serialized bytes, 320 KiB per message, 1,000 field rules, 1,000 sites.

## Migrations

`openDatabase` performs versioned upgrades inside `onupgradeneeded`. A database with a newer, unknown version raises `VersionError`: the background stops saving and settings show a repair message; the database is never deleted to recover (`storage.test.ts` covers this). Future migrations must add fixtures for the previous version and rollback tests.
