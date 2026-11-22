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

- File = `content/<collection>/<id>/<lang>.mdx`. `id` (the folder) and `lang` (the file name) are not
  repeated in frontmatter. `id` **never changes**, even if slug or URL change. URL is computed from
  frontmatter by `urlFor()`, not from the file path.
- Frontmatter contract: Zod schemas in `packages/core/src/schema.ts`; JSON Schema for tools in
  `packages/core/schema.json` (regenerate with `pnpm content schema --out packages/core/schema.json`).
  `title` = H1, `seoTitle` = `<title>` when different, `description` = meta description.
- Record address: `<type>/<id>:<lang>`; section (chunk) address: `<type>/<id>:<lang>#<anchor>`. The same
  address is the key in vectors, D1, agent links and `.md` copies.
- Languages: `en` (root), `uk` (URL prefix `/ua`, hreflang `uk`), `ru` (`/ru`). Do not rename `/ua`.
- Changing a published URL requires adding the old path to `legacyUrls` in frontmatter; `_redirects` is
  generated from it. No redirect chains.
- MDX uses only the fixed component set (`Shot`, `Callout`, `Answer`, `FAQ`, `Quiz`, `YouTube`, and the
  click-to-load embeds `BuyMeACoffee`, `VideoAsk`). No arbitrary imports or JSX logic. Structured data (`faq`, `related`) lives in frontmatter.
- Heading anchors: Markdown headings get the github-slugger id Astro injects. A legacy Webflow H2 anchor
  that differs from it is preserved with a JSX heading on its own line: `<h2 id="fees-amp-rates">Fees
&amp; rates</h2>` (`legacyAnchor()` reproduces the Webflow script exactly). Never use `{#id}`: in MDX
  braces are JS expressions and break the build.
- `extractHeadings()` from core is the single source of anchors for the TOC, `content.json` and section
  addresses. Do not use Astro's `headings` (it skips JSX headings).
- `visibility: private` content never reaches the build and may live only in `content/notes/`.

## Safety rules for machines

- Bots, agents and the admin **only propose**: new files in `content/inbox/` or a `draft/<slug>` branch →
  PR. Publishing = merge into `main`. Bots and automated agents never merge. Claude Code sessions
  working for the owner may merge a PR themselves once **all** checks are green (owner decision
  2026-11-22), using merge commits; anything red or unchecked waits for the owner.
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
pnpm test             # unit tests (packages/core)

pnpm content validate                 # all content checks; add --json for agents
pnpm content create guides/<id>:<lang> --title "…" --description "…" --field hub=… --field category=… --field slug=…
pnpm content index --out <file>       # content.json (published public records)
pnpm content redirects --out <file>   # _redirects from legacyUrls + data/redirects/*.csv
pnpm content schema --out packages/core/schema.json

pnpm legacy:crawl                     # re-snapshot the live Webflow site into data/legacy/
pnpm webflow:export                   # Webflow Data API → data/legacy/webflow-export/ (needs .env)
pnpm webflow:media                    # download Webflow CDN files → data/legacy/media/ + media-map.json
pnpm convert                          # Webflow export + snapshot → content/{guides,hubs,categories,pages}
                                      # (wipes and regenerates them) + data/convert-report.md
```

Webflow API notes: the primary locale (en) must be requested without `localeId`; 301 redirects are
not available via the API on this plan (Enterprise only). Live meta description = CMS `meta-description`,
falling back to `post-summary` when empty. `data/legacy/media-archive/` (asset-manager files nothing
references) is git-ignored and goes to R2 later.

`data/legacy/` is the frozen snapshot of the old site (urls.csv, pages.json with SEO fields, JSON-LD,
links, media and legacy H2 anchors; raw HTML in html/). It is the reference for parity checks; do not
edit it by hand, re-run the crawler instead.

Exit codes of `pnpm content`: 0 ok, 1 content problems, 2 usage error. `create` checks schema and URL
uniqueness only; always run `validate` after it.

The site reads content through one Astro collection (`apps/site/src/content.config.ts`) whose schema
is the core schema and whose entry ids are record addresses. Pages must filter with `isPublished()`.

## Decisions and known quirks

Owner decisions on the migration (2026-11-22):

- `/ru/` and the untranslated `/ua|/ru/create/no-code/prd-for-vibe-coding` are migrated 1:1.
- Hidden course pages (`/courses/how-to-create-images-with-ai`, `/courses/payment-alternatives` in all
  three languages, not in the sitemap) are migrated 1:1 with their current robots: `noindex: true`
  everywhere except `/ua/courses/how-to-create-images-with-ai`, which stays indexable. They stay out
  of the sitemap.
- No broken internal links, with no exceptions: `pnpm check:build` fails on every one. The legacy
  link to the 404 `/ua/courses/chatgpt` (the "ChatGPT 101" card on the three `/courses` pages) now
  points to the ChatGPT guide in the page's language: `/create/ai/chatgpt`, `/ua/create/ai/chatgpt`,
  `/ru/create/ai/chatgpt`. The URL `/ua/courses/chatgpt` itself stays a 404 (owner decision
  2026-11-22, replaces "kept as is").
- The newsletter form on the home pages (Webflow "Newsletter Form", field `email`) is hidden for
  now: no form markup and no Beehiiv attribution script on the new site, the surrounding text stays.
  Not a DNS-switch blocker; the parity check documents it as an intended difference.
- Legacy defects that are fixed on purpose (invalid JSON-LD, wrong titles on `/ua|/ru/tools` and
  `/courses/privacy-policy`) are reported by the parity check as documented differences, never
  silently.
- `noindex` is migrated 1:1 (26 pages: affiliate-disclosure, courses/privacy-policy,
  courses/public-offer, hidden course pages, payment pages, search, terms-of-service). They carry
  `noindex: true` and stay out of the sitemap; this is intended, not a defect. Webflow emitted two
  robots tags on them (`noindex` plus the site-wide `max-image-preview:large`); the snapshot keeps both.

- TypeScript pinned to 6.0.x: typescript-eslint and @astrojs/check do not support TS 7 yet.
- Workers `html_handling` redirects `/path/` → `/path` with **307**; the legacy site used 301. Fixed in
  Step 7 (redirect rules).
- Images stay in the repo next to content and are optimised by `astro:assets` (≈29 MB total). R2 is for
  raw files of later stages.
- Astro 7 Markdown runs on the Rust pipeline (Sätteri): do HTML→MDX transformations in the one-off
  conversion script, not as remark/rehype build plugins.
- Core runs under Node's built-in TypeScript stripping (no build step): relative imports use `.ts`
  extensions and only erasable syntax is allowed (no enums, namespaces, parameter properties).
- `pnpm convert` owns `content/{guides,hubs,categories,pages}` until the migration is signed off: fix
  conversion problems in `scripts/convert/`, not in the generated records. Webflow resolved relative
  links at publish time (`/<collection>/<item>` → template path, uk/ru pages get the locale prefix);
  the converter reproduces that, so links in records equal the live ones.
- URLs for essays, log, til, links, notes and projects (`/<collection>/<slug>`) are provisional until
  the first record of that type is published.

## Plan

Stage 1 plan and audit: see the approved plan (owner has it). Current step is tracked in PR titles
(`step-N-…` branches).
