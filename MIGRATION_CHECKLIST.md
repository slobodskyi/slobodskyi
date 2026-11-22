# Migration checklist: Webflow → Cloudflare Workers

The DNS switch is done by the owner. Machines never switch DNS or cancel anything in Webflow.
Keep Webflow running and paid for at least a month after the switch: it is the instant rollback.

Current state (2026-11-22): the zone `slobodskyi.com` is on Cloudflare; `slobodskyi.com` is an A record
to Webflow (198.202.211.1) and `www` a CNAME to `cdn.webflow.com`. The new site runs as the preview
Worker `slobodskyi-site-preview` (noindex) at https://slobodskyi-site-preview.slobodskyi.workers.dev.

## 1. Before the switch

- [ ] CI is green on `main`: format, lint, check, test, `content validate`, build, `check:build`
      (no broken links), `check:parity` with 0 undocumented differences.
- [ ] Owner reviewed the preview: home, a hub, a category, two articles, `/tools`, `/contacts`, 404,
      on desktop and phone. Design is close to the old one, not pixel-perfect.
- [ ] Owner reviewed the AI-written texts (marked `ai.assisted` in frontmatter) and the `/tools` titles.
- [ ] Lighthouse (mobile) on a typical article: ≥ 95, LCP < 2.5 s, CLS < 0.1.
- [ ] Spot-check on the preview:
  - `/about/` → 301 `/about`; `/blog` → 301 `/ru`; three random rows of `data/redirects/*.csv` → 301
    to the right page, no chains;
  - `sitemap.xml`, `robots.txt`, `rss.xml`, `llms.txt` open; sitemap has no noindex pages;
  - one article: `<title>`, description, canonical, H1, hreflang equal the live page; JSON-LD passes
    https://validator.schema.org.
- [ ] Production deploy without a domain: `pnpm build && pnpm --filter site exec wrangler deploy`
      (Worker `slobodskyi-site`, reachable on its `workers.dev` address only).
- [ ] Note today's numbers to compare later: Search Console clicks/impressions (last 28 days), indexed
      pages count, top 20 pages by clicks.
- [ ] Lower the TTL of the `slobodskyi.com` and `www` records to 5 minutes a day before (only matters
      for DNS-only records).

## 2. Switch day (owner, Cloudflare dashboard)

- [ ] Workers & Pages → `slobodskyi-site` → Settings → Domains & Routes → add Custom Domain
      `slobodskyi.com`. If Cloudflare refuses because a record exists, delete the A record to Webflow
      first (write down its value for the rollback).
- [ ] Same for `www.slobodskyi.com`, then Rules → Redirect Rules → template "Redirect from WWW to root"
      (301, keep path and query).
- [ ] SSL/TLS → Edge Certificates → Always Use HTTPS: on (http → https is 301).
- [ ] Web Analytics → add `slobodskyi.com` (automatic setup; no script in the code is needed).
- [ ] Security: Bot Fight Mode on; AI Crawl Control: allow search and agent crawlers (Googlebot, Bingbot,
      OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot, Claude-User); training crawlers —
      owner's decision.
- [ ] Right after: `curl -sI https://slobodskyi.com` shows no `x-wf-*` headers; check
      `http://`, `www.`, `/about/` and `/blog` redirects; open the contacts page and one article.

## 3. Right after the switch

- [ ] Search Console: URL inspection of home and two articles (live test), resubmit `sitemap.xml`.
- [ ] Bing Webmaster Tools: resubmit the sitemap.
- [ ] Google Rich Results Test on one article (BreadcrumbList, BlogPosting, FAQ).
- [ ] Partner links via `slobo.click` still work (separate service, do not change it).

## 4. First week

- [ ] Search Console daily: coverage errors, 404s, "Page with redirect" spikes, Core Web Vitals.
- [ ] Cloudflare: Worker errors (Observability) and 404s in Web Analytics; any legacy URL that 404s gets
      a row in `data/redirects/` through a PR.
- [ ] Compare clicks/impressions with the numbers from step 1. A short dip is normal; a steady drop on
      specific pages means a lost title/H1/anchor — check them with `check:parity`.

## 5. Later (not blockers)

- [ ] openeyesdesign.com: the owner sets up the redirect on Vercel (today every path returns 404).
- [ ] Make the GitHub repository private again.
- [ ] Alt texts for images without alt: separate PR via Claude vision, each marked for review.
- [ ] Upload `data/legacy/media-archive/` to R2.
- [ ] After a month without problems: decide on the Webflow plan (owner only).

## Rollback

Remove the Custom Domains from the Worker and restore the A record `slobodskyi.com` → 198.202.211.1 and
the CNAME `www` → `cdn.webflow.com` (DNS only). Webflow serves the old site again within minutes.
