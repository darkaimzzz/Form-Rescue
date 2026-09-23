# ADR 0004: Matching baseline and field identity

**Status:** accepted, 2026-09-23

**Decision.** Implement the PRD baseline unchanged: unique id +60, unique name +50, unique label +25, group +20, ordinal +5 (weak: adds points, never counts as a signal). Direct restore requires score ≥80, at least two independent signals, a ≥25-point margin over the next candidate, the same form key, the same kind and option set, and a one-to-one assignment. id/name/label share one hashed token domain so identical tokens count once.

Field keys (used for merging and exclusion rules) combine kind, form key, id and name tokens, an **occurrence index** among controls that share tag/type/id/name, and the option signature; controls with neither id nor name also use label + ordinal. The occurrence index was added after an E2E test showed two same-name textareas colliding into one saved field.

Form descriptors are computed once per document, so later DOM changes can't change a draft's identity mid-session.

**Consequences.** A textarea whose only identity is a name echoed by its label scores 75 and becomes copy-only. That is intentional. Changing thresholds requires a new ADR and more adversarial fixtures.
