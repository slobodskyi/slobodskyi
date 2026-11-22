---
name: audit
description: Run every local check of the repo (format, lint, types, tests, content validation, build, build checks, parity) and explain failures to the owner in Ukrainian with what to fix. Use before a PR or when asked to "audit"/"перевір усе".
disable-model-invocation: true
allowed-tools: Bash
---

# /audit — all checks, one report

Answer the owner in **Ukrainian**. Do not fix anything unless asked; report. Run from the repo root
(Node via `eval "$(fnm env)" && fnm use`, `pnpm install` first if `node_modules` is missing).

Run the steps in this order, each once, and keep going after a failure (collect results):

1. `pnpm format:check` (fix hint: `pnpm format`)
2. `pnpm lint`
3. `pnpm check`
4. `pnpm test`
5. `pnpm content validate --json` (exit 1 = content problems, 2 = usage error)
6. `pnpm build` — skip steps 7–8 if it fails
7. `pnpm check:build`
8. `pnpm check:parity` (writes `data/parity-report.md`; documented differences are not failures)

Run long steps (`build`, `check:parity`) in the background and wait for completion rather than polling.

## Report

A table: step → ✅ / ❌ / ⏭ (skipped, why). For every ❌ give, in Ukrainian:

- what broke, in one sentence, with `file:line` from the output;
- what exactly to change (for `content validate`: the record address `<type>/<id>:<lang>` and the field);
- whether it is safe to fix automatically (`pnpm format`, `eslint --fix`) or needs the owner's decision.

Respect the project rules: URLs, titles, descriptions, canonicals and H1 of legacy pages never change
without the owner's decision; `pnpm check:build` allows no broken internal links; never edit derived data
or `data/legacy/` by hand. End with one line: ready for PR or not.
