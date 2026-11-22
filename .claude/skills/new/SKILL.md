---
name: new
description: Create a new content record (guide, essay, log, til, links, note, project, page) on a draft/<slug> branch with the project CLI. Use when the owner wants to start a new article or record.
argument-hint: <type> [title]
disable-model-invocation: true
allowed-tools: Bash, Read
---

# /new <type> — new draft record

Answer the owner in **Ukrainian**. `$ARGUMENTS` = type (and optionally a title). Never write the file by
hand and never duplicate CLI logic: `pnpm content create` owns schema, defaults and URL uniqueness.

## 1. Ask for the minimum (one short question, only what is missing)

- **language**: `en` (default), `uk`, `ru`;
- **title** (H1) and **description** (meta description, ~150 chars);
- **slug** (kebab-case, used as folder `id` and in the URL) — propose one from the title;
- type-specific:
  - `guides` → `hub` (`create|connect|monetize|grow`) and `category` (must exist in `content/categories/`);
  - `links` → optional `href`;
  - `pages` → `path` (URL path without language prefix);
  - `essays|log|til|notes|projects` → nothing more.

Collection ↔ type: guides/guide, essays/essay, log/log, til/til, links/links, notes/note,
projects/project, pages/page. Hubs and categories are structural: do not create them without an explicit
owner request. Notes are the only place for `visibility: private`.

## 2. Branch first

`git switch -c draft/<slug>` from an up-to-date `main` (`git fetch origin main` and branch from
`origin/main` when the current branch is not main). Never commit on `main`.

## 3. Create and validate

```
pnpm content create <collection>/<id>:<lang> --title "…" --description "…" --field slug=<slug> [--field hub=… --field category=…] --json
pnpm content validate --json
```

Exit 1 from `create` = problem (slug/URL already taken, bad field): show the message, fix the input,
retry. `validate` must be clean for the new record.

## 4. Report (Ukrainian)

The created file path (`content/<collection>/<id>/<lang>.mdx`), the record address, the future URL (take
it from the `create` JSON output; if absent, `urlFor()` result), the branch name, and the next step:
write the body, then `/publish`. Mention that the record is `status: draft` and is not built until
published. Mark machine-written text with `ai: { assisted: true }` in frontmatter. Do not commit.
