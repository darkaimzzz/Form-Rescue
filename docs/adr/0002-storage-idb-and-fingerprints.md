# ADR 0002 — IndexedDB, keyed fingerprints, strict durability

**Status:** accepted, 2026-09-23

**Decision.** Store drafts, revisions, policies, rules and a metadata record in IndexedDB (`idb` 8). Each commit is one readwrite transaction with `durability: "strict"`, so an acknowledgement means the commit was flushed; the crash test (`durability.spec.ts`) exercises this. Route, form and field identifiers are HMAC-SHA-256 fingerprints with a random 256-bit per-install key in extension-local storage, truncated to 18 bytes (base64url). Raw URLs, labels, names and ids are never persisted.

**Alternatives.** A `storage.local` JSON blob (no per-record atomicity); unkeyed SHA-256 (dictionary-guessable metadata); encrypting drafts with a key stored beside them (would not justify any security claim).

**Consequences.** Slightly slower commits (measured p95 round trip about 28 ms). Fingerprints are not encryption, and the docs say so.
