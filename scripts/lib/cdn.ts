// Webflow CDN URLs: one matcher for the crawler, the media downloader and later the parity check
// ("no links to website-files.com").

export const WEBFLOW_CDN =
  /https:\/\/(?:cdn\.prod\.website-files\.com|assets\.website-files\.com|assets-global\.website-files\.com|uploads-ssl\.webflow\.com)\/[^"'\s<>,\\]+/g;

/** Drops a trailing ")" that closes a CSS url(…) but keeps the ones in names like "icon (2).svg". */
function trimParens(url: string): string {
  let u = url;
  for (;;) {
    if (u.endsWith(';')) u = u.slice(0, -1);
    else if (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0))
      u = u.slice(0, -1);
    else return u;
  }
}

/** Canonical form: HTML entities and %2F decoded, no query or hash. */
export function normalizeCdnUrl(url: string): string {
  const decoded = url.replace(/&quot;?.*$/, '').replace(/&amp;/g, '&');
  return trimParens(decoded)
    .replace(/%2F/gi, '/')
    .replace(/[?#].*$/, '');
}

/** All Webflow CDN URLs in a text (HTML, CSS, JSON), normalised and de-duplicated. */
export function findCdnUrls(text: string): string[] {
  return [...new Set([...text.matchAll(WEBFLOW_CDN)].map((m) => normalizeCdnUrl(m[0])))];
}
