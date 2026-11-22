// sitemap.xml: indexable published records with lastmod and hreflang alternates.
import type { APIRoute } from 'astro';
import { absoluteUrl, publishedRecords, translationsOf, type Rec } from '../lib/content';

/** Indexable records, minus those marked `sitemap: false` in frontmatter. */
const inSitemap = (rec: Rec): boolean => !rec.data.noindex && rec.data.sitemap !== false;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async () => {
  const records = (await publishedRecords()).filter(inSitemap);
  const urls = await Promise.all(
    records.map(async (rec) => {
      const alts = (await translationsOf(rec)).filter(inSitemap);
      const en = alts.find((r) => r.lang === 'en');
      const links = alts.map(
        (r) => `    <xhtml:link rel="alternate" hreflang="${r.lang}" href="${esc(absoluteUrl(r.url))}"/>`,
      );
      if (en)
        links.push(
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(absoluteUrl(en.url))}"/>`,
        );
      return [
        '  <url>',
        `    <loc>${esc(absoluteUrl(rec.url))}</loc>`,
        `    <lastmod>${rec.data.updated}</lastmod>`,
        ...(alts.length > 1 ? links : []),
        '  </url>',
      ].join('\n');
    }),
  );
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls.join('\n') +
    '\n</urlset>\n';
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
