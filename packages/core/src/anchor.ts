import GithubSlugger from 'github-slugger';

/**
 * Exact port of the inline Webflow script that assigned ids to H2 headings on the legacy site:
 *
 *   str = heading.innerHTML;
 *   str = str.replace(/\s+/g, '-').replace(/[°&\/\\#,+()$~%.'":;*?<>{}]/g, "").toLowerCase();
 *
 * Input must be the heading's innerHTML as a browser serialises it: text with &, <, > and
 * non-breaking spaces escaped as &amp; &lt; &gt; &nbsp; and quotes left as-is. So "Fees & rates"
 * becomes "fees-amp-rates", exactly like on the live site. Hyphens are not collapsed and
 * duplicates are not de-duplicated, as in the original.
 */
export function legacyAnchor(innerHtml: string): string {
  return innerHtml
    .replace(/\s+/g, '-')
    .replace(/[°&/\\#,+()$~%.'":;*?<>{}]/g, '')
    .toLowerCase();
}

/**
 * Anchor generator for new headings. Matches what Astro injects (github-slugger), including
 * "-1", "-2" suffixes for repeated headings within one document.
 */
export function createAnchorer(): (text: string) => string {
  const slugger = new GithubSlugger();
  return (text) => slugger.slug(text);
}
