---
name: publish
description: Publish ready draft records - run checks, set status published and the updated date, commit, push and open a PR (never merge). Use when the owner says a record is ready to go live.
argument-hint: <type>/<id>[:<lang>] ...
disable-model-invocation: true
allowed-tools: Bash, Read, Edit
---

# /publish — checks, status, PR (never merge)

Answer the owner in **Ukrainian**. Publishing = merge into `main`, and **only the owner merges**: this
skill ends with an open PR.

`$ARGUMENTS` = record address(es) `<type>/<id>[:<lang>]`; without a lang, every language file of the
record. If empty, list `status: draft|review` records changed on this branch and ask which ones.

## Steps

1. **Branch**: `git branch --show-current` must not be `main`. If it is, stop and suggest `/new` or
   `git switch -c draft/<slug>`. Never commit to `main`.
2. **Pre-check the record**: `pnpm content validate --json`. A published public record needs `title`,
   `description`, no unresolved TODOs, `visibility: public` (never publish `notes/` private records).
   Ask the owner if something looks unfinished.
3. **Edit frontmatter** of each chosen file (`content/<collection>/<id>/<lang>.mdx`): `status: published`
   and `updated: <today, YYYY-MM-DD>`. Touch nothing else — in particular never change `slug`, `hub`,
   `category` or any published URL (changing one needs `legacyUrls`, an owner decision).
4. **Checks** (once each, in order): `pnpm format:check` (`pnpm format` to fix), `pnpm lint`, `pnpm check`,
   `pnpm test`, `pnpm content validate`, `pnpm build`, `pnpm check:build`, `pnpm check:parity`. Stop on
   the first failure and explain it (Ukrainian); do not commit failing work.
5. **Commit** (small, English message, e.g. `content: publish guides/<id>`), with the attribution line
   required by the session's instructions. Stage only the chosen files.
6. **Push**: `git push -u origin <branch>`.
7. **PR**: `gh pr create --base main` with a body listing: records (address → URL), what changed, check
   results, and a preview link if a preview deploy of this branch exists (`pnpm deploy:preview` is manual
   and owner-run; do not deploy yourself, just state none exists). End the body with
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
8. After the PR is open, use the repo's PR tooling to read its status; do not poll CI.

Report to the owner (Ukrainian): PR link, published URLs, and "merge — за тобою". Never run
`gh pr merge`, never enable auto-merge.
