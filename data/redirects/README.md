# Static redirects

CSV files here (`from,to,status`; `#` lines are comments) are merged with `legacyUrls` from content
frontmatter by `pnpm content redirects` into the Cloudflare `_redirects` file. Chains are flattened,
conflicts and rules that would shadow a live page fail the build.

## webflow-301.csv

Exported from Webflow on 2026-11-22 (raw file: `data/legacy/webflow-redirects.csv`, 106 rules → 104).
Normalisation:

- `/shutterstock-ekzamen` and `/vyvod-deneg/tpost/bo7mhprzpb-kak-vivesti-dengi-gettyimages-i-istock`:
  target lacked the leading `/` (`ru/monetize/…`), fixed to `/ru/monetize/…`.
- Cloudflare `_redirects` matches paths, not query strings, so `?amp=true` rules were folded into
  their path: `…preply-kak-vivesti-dengi?amp=true` became a plain path rule; the `?amp=true` rules for
  dreamstime and payeer were dropped because a rule for the same path exists. For dreamstime this
  changes the AMP target from `/ru/monetize/payments` to the path rule's `/ru/monetize/payments/payoneer`.
- Percent-encoded Cyrillic sources (6 rules) are kept as exported; that Cloudflare matches them is
  verified on the preview in Step 7.

- Owner decision (2026-11-22): two rules pointed to pages that are 404 on the live site and now point
  to live pages: `/courses/chatgpt1` → `/courses` (was `/courses/chatgpt`) and `/create/vibe-coding` →
  `/create/no-code/prd-for-vibe-coding` (was `/create/content`, an unpublished category).
