# slobodskyi.com v2 — platform

Blog of Oleksandr Slobodskyi, migrating from Webflow. Talk to the owner in **Ukrainian**; write code,
comments, commits and file names in **English**.

## Prime directive

**Do not lose organic traffic.** Every legacy URL keeps its path, title, description, canonical, H1 and
hreflang unless the owner explicitly decides otherwise. Never delete or change a public URL on your own.

## Architecture

- **Git is the single source of truth.** Content is MDX in `content/`. Everything else — HTML, `.md`
  copies, `content.json`, vectors, D1 rows, search indexes — is derived and must be rebuildable from git
  with one command. Never hand-edit derived data.
- **Site**: Astro 7, fully static (`apps/site`), served by Cloudflare Workers static assets. Zero JS by
  default; islands only where needed. The Worker (`apps/site/src/worker.ts`) runs only for `/api/*`
  (and for every request in the preview env, to add `X-Robots-Tag: noindex`).
- **Core**: `packages/core` holds Zod schemas, `urlFor()`, `legacyAnchor()` and content operations
  (`validate`, `create`, `buildIndex`, `buildRedirects`). Operations read and write only through the
  `ContentSource` interface, never the filesystem directly (`FsSource` now; `GitHubSource` /
  `IndexSource` later for Workers). The CLI (`pnpm content <cmd> --json`), skills and the future MCP
  server are thin wrappers over these operations — never duplicate their logic.
- **Later (not now)**: `apps/worker` = the "control panel" Worker (API + MCP, D1, R2, Queues, cron),
  Telegram bot, admin UI, vector search (AI Search or Vectorize). Keep the site independent of it.

## Repository layout

```
apps/site/         Astro site + Worker entry (src/worker.ts), wrangler.jsonc
apps/worker/       (later) control panel Worker
packages/core/     schemas, URL rules, content operations, CLI
content/<type>/<id>/{en,uk,ru}.mdx   one folder per record, images next to it
content/inbox/     raw material dropped by machines
data/legacy/       snapshot of the old site (urls.csv, html/, webflow-export/)
data/redirects/    static redirect list (Webflow export etc.)
scripts/           crawler, Webflow import, conversion, checks
.claude/skills/    project skills
```

Types: `guides essays log til links notes projects pages hubs categories`.

## Content model and addressing

- `id` is the folder name and **never changes**, even if slug or URL change. URL is computed from
  frontmatter by `urlFor()`, not from the file path.
- Record address: `<type>/<id>:<lang>`; section (chunk) address: `<type>/<id>:<lang>#<anchor>`. The same
  address is the key in vectors, D1, agent links and `.md` copies.
- Languages: `en` (root), `uk` (URL prefix `/ua`, hreflang `uk`), `ru` (`/ru`). Do not rename `/ua`.
- Changing a published URL requires adding the old path to `legacyUrls` in frontmatter; `_redirects` is
  generated from it. No redirect chains.
- MDX uses only the fixed component set (`Shot`, `Callout`, `Answer`, `FAQ`, `Quiz`, `YouTube`). No
  arbitrary imports or JSX logic. Structured data (`faq`, `related`) lives in frontmatter.
- Headings get explicit, stable ids. Legacy H2 anchors are kept exactly (Webflow slug format: lowercase,
  punctuation removed, spaces → hyphens, Cyrillic preserved).
- `visibility: private` content never reaches the build and may live only in `content/notes/`.

## Safety rules for machines

- Bots, agents and the admin **only propose**: new files in `content/inbox/` or a `draft/<slug>` branch →
  PR. Publishing = merge into `main`, and **only the owner merges**.
- Mark machine-made content in frontmatter (`ai: { assisted: true }`).
- Never commit secrets. Tokens live in `.env` / `.dev.vars` (git-ignored) or Cloudflare secrets.
- Never switch DNS, cancel anything in Webflow, or touch `slobo.click` (separate service).
- Small, meaningful commits on branches; `main` only through PRs.

## Running

Requires Node ≥ 22.23.4 (`.node-version`, use `fnm use`) and pnpm 12 (`npm i -g pnpm@12`; corepack
cannot run pnpm 12's native binary).

```
pnpm install          # also sets git core.hooksPath=.githooks (or run `pnpm run prepare`)
pnpm dev              # Astro dev server
pnpm build            # static build → apps/site/dist
pnpm preview          # build output in local workerd (wrangler dev)
pnpm check            # astro check + Worker type check
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm deploy:preview   # build + deploy to the noindex preview Worker
```

## Decisions and known quirks

- TypeScript pinned to 6.0.x: typescript-eslint and @astrojs/check do not support TS 7 yet.
- Workers `html_handling` redirects `/path/` → `/path` with **307**; the legacy site used 301. Fixed in
  Step 7 (redirect rules).
- Images stay in the repo next to content and are optimised by `astro:assets` (≈29 MB total). R2 is for
  raw files of later stages.
- Astro 7 Markdown runs on the Rust pipeline (Sätteri): do HTML→MDX transformations in the one-off
  conversion script, not as remark/rehype build plugins.

## Plan

Stage 1 plan and audit: see the approved plan (owner has it). Current step is tracked in PR titles
(`step-N-…` branches).
