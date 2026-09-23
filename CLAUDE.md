# CLAUDE.md — working on Form Rescue

Spec: `docs/PRD.md`. Status and evidence: `docs/implementation-status.md` (keep it current).

## Architecture (short)

- `packages/core` — pure TS: `classifyField` (metadata-only eligibility), `looksSensitiveValue`, zod schemas + `LIMITS`, `fieldIdentity`/`formKey`/`routeHash` (HMAC via injected hasher), `matchFields`, retention.
- `packages/storage` — IndexedDB (`idb`): `commitEdit` (one strict-durability transaction), epochs, deletion, field rules, pruning.
- `apps/extension/src/background` — message routing, `classifySender` authorization, capabilities (per tab/document), script registration, recovery plans.
- `apps/extension/src/content` — isolated-world capture (trusted `input`/`change` only), debounce 300 ms / max 1 s, apply + verify + undo.
- UI: React pages; strings in `src/ui/strings.ts`.
- Website: Astro in `apps/website`; config/links in `src/config.ts`.

## Commands

`pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e:chrome`, `pnpm test:firefox`, `pnpm test:a11y`, `pnpm test:performance`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm package`, `pnpm release:validate`.

## Non-negotiable rules

- Decide eligibility from metadata **before** reading any value. Never log values or classifier inputs.
- No network APIs, analytics, remote code, `eval`, main-world injection, `externally_connectable` or web-accessible draft UI.
- Draft values render as text only.
- Never trust payload origin/tab/draft IDs; derive context from `sender`; re-validate before restore.
- Deletion bumps epochs; buffered edits must never resurrect data.
- Only synthetic data in fixtures, screenshots, recordings and issues. No real browser profiles in the repo.
- Don't widen permissions or scope (P1/P2 items) without an ADR.

## Verification protocol

Before claiming something works: run the relevant tests and read the output. Use `pressSequentially`/keyboard in E2E (Playwright `fill`/`selectOption` are untrusted and ignored by design). Record browser versions actually used. Never mark untested browsers or unpublished listings as done. Tool input may turn `‮`-style escapes into literal characters — build such strings with `String.fromCharCode` in tests.
