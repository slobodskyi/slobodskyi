// Snapshot of the legacy Webflow site before any conversion (Step 2).
//
//   pnpm legacy:crawl
//
// Crawls https://slobodskyi.com from sitemap.xml + the home page, following internal links,
// hreflang alternates and canonicals. Does not follow redirects into other hosts.
// Writes (deterministic, sorted):
//   data/legacy/html/<path>.html   raw HTML of every page (backup)
//   data/legacy/urls.csv           one row per URL: status, SEO fields, H1, type, links, JSON-LD types
//   data/legacy/pages.json         full extracted data incl. JSON-LD, links, media, H2 anchors
//   data/legacy/site/              robots.txt, sitemap.xml, llms.txt
//   data/legacy/snapshot.json      when and what was crawled
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { findCdnUrls } from '../lib/cdn.ts';
import { HUBS, LANG_PREFIX, createAnchorer, internalPath, legacyAnchor } from '@slobodskyi/core';
import { attr, byId, byTag, findAll, innerHtml, meta, parseHtml, rawText, textOf } from '../lib/html.ts';

const ORIGIN = 'https://slobodskyi.com';
const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'data', 'legacy');
const USER_AGENT = 'Mozilla/5.0 (compatible; site-migration-snapshot/1.0)';
const CONCURRENCY = 4;
const ASSET = /\.(png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|mp4|webm|mp3|css|js|json|xml|txt|woff2?)$/i;

interface PageRecord {
  url: string;
  status: number;
  redirectTo: string | null;
  inSitemap: boolean;
  lang: string | null;
  pageType: string;
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogType: string | null;
  hreflang: Record<string, string>;
  h1: string[];
  /** H2 in #content with the id the legacy Webflow script assigned, and the github-slugger id. */
  anchors: { text: string; legacy: string; slugger: string }[];
  internalLinks: string[];
  externalLinks: string[];
  jsonLd: { valid: boolean; types: string[]; raw: string }[];
  media: string[];
  forms: string[];
  iframes: string[];
  scripts: string[];
  htmlFile: string | null;
  bytes: number;
}

const PREFIXES = Object.values(LANG_PREFIX).filter(Boolean);

function pageType(path: string): string {
  const prefix = PREFIXES.find((p) => path === p || path.startsWith(p + '/')) ?? '';
  const rest = path.slice(prefix.length).split('/').filter(Boolean);
  if (rest.length === 0) return 'home';
  if ((HUBS as readonly string[]).includes(rest[0] ?? '')) {
    return (['hub', 'category', 'article'] as const)[rest.length - 1] ?? 'other';
  }
  return 'page';
}

/** File in data/legacy/html for a path: "/" → index.html, "/ua/tools" → ua/tools.html. */
const htmlFileFor = (path: string) => (path === '/' ? 'index.html' : `${path.slice(1)}.html`);

async function fetchOnce(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: 'manual',
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status >= 500 && attempt < 3) continue;
      return res;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
}

function extract(path: string, html: string, status: number, inSitemap: boolean): PageRecord {
  const doc = parseHtml(html);
  const html0 = byTag(doc, 'html')[0];
  const head = byTag(doc, 'head')[0] ?? doc;
  const links = findAll(head, (n) => n.tagName === 'link');
  const title = byTag(head, 'title')[0];

  const hreflang: Record<string, string> = {};
  for (const l of links) {
    const lang = attr(l, 'hreflang');
    const href = attr(l, 'href');
    if (attr(l, 'rel') === 'alternate' && lang && href) hreflang[lang] = internalPath(href) ?? href;
  }
  const canonicalHref = links.find((l) => attr(l, 'rel') === 'canonical');

  const internal = new Set<string>();
  const external = new Set<string>();
  for (const a of byTag(doc, 'a')) {
    const href = attr(a, 'href');
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
    const p = internalPath(href);
    if (p) internal.add(p);
    else if (/^https?:/i.test(href)) external.add(href);
  }

  const anchorFor = createAnchorer();
  const content = byId(doc, 'content');
  const anchors = content
    ? byTag(content, 'h2').map((h) => {
        const text = textOf(h);
        return { text, legacy: legacyAnchor(innerHtml(h)), slugger: anchorFor(text) };
      })
    : [];

  const jsonLd = findAll(doc, (n) => n.tagName === 'script' && attr(n, 'type') === 'application/ld+json').map(
    (s) => {
      const raw = rawText(s).trim();
      try {
        const data = JSON.parse(raw) as unknown;
        const items = Array.isArray(data) ? data : [data];
        const types = items.flatMap((item) => {
          const o = item as { '@type'?: unknown; '@graph'?: { '@type'?: unknown }[] };
          return o['@graph'] ? o['@graph'].map((g) => String(g['@type'])) : [String(o['@type'])];
        });
        return { valid: true, types, raw };
      } catch {
        return { valid: false, types: [], raw };
      }
    },
  );

  const media = findCdnUrls(html).sort();

  return {
    url: path,
    status,
    redirectTo: null,
    inSitemap,
    lang: (html0 && attr(html0, 'lang')) ?? null,
    pageType: pageType(path),
    title: title ? textOf(title) : null,
    description: meta(head, 'name', 'description') ?? null,
    canonical: canonicalHref ? (attr(canonicalHref, 'href') ?? null) : null,
    robots: meta(head, 'name', 'robots') ?? null,
    ogTitle: meta(head, 'property', 'og:title') ?? null,
    ogDescription: meta(head, 'property', 'og:description') ?? null,
    ogImage: meta(head, 'property', 'og:image') ?? null,
    ogType: meta(head, 'property', 'og:type') ?? null,
    hreflang,
    h1: byTag(doc, 'h1').map(textOf),
    anchors,
    internalLinks: [...internal].sort(),
    externalLinks: [...external].sort(),
    jsonLd,
    media,
    forms: byTag(doc, 'form').map(
      (f) => attr(f, 'data-name') ?? attr(f, 'name') ?? attr(f, 'id') ?? '(form)',
    ),
    iframes: byTag(doc, 'iframe').map((f) => attr(f, 'src') ?? ''),
    scripts: byTag(doc, 'script')
      .map((s) => attr(s, 'src'))
      .filter((s): s is string => Boolean(s)),
    htmlFile: status === 200 ? htmlFileFor(path) : null,
    bytes: html.length,
  };
}

const csvCell = (value: unknown): string => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCsv(pages: PageRecord[]): string {
  const header = [
    'url',
    'status',
    'redirect_to',
    'in_sitemap',
    'lang',
    'page_type',
    'title',
    'description',
    'canonical',
    'robots',
    'hreflang',
    'h1',
    'h1_count',
    'og_title',
    'og_image',
    'jsonld_types',
    'jsonld_valid',
    'internal_links_count',
    'internal_links',
    'media_count',
    'html_file',
  ];
  const rows = pages.map((p) => [
    p.url,
    p.status,
    p.redirectTo,
    p.inSitemap,
    p.lang,
    p.pageType,
    p.title,
    p.description,
    p.canonical,
    p.robots,
    Object.entries(p.hreflang)
      .map(([k, v]) => `${k}=${v}`)
      .join(' '),
    p.h1[0] ?? '',
    p.h1.length,
    p.ogTitle,
    p.ogImage,
    p.jsonLd.flatMap((j) => j.types).join(' '),
    p.jsonLd.every((j) => j.valid),
    p.internalLinks.length,
    p.internalLinks.join(' '),
    p.media.length,
    p.htmlFile,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

async function save(rel: string, data: string): Promise<void> {
  const file = join(OUT, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data, 'utf8');
}

async function main(): Promise<void> {
  const sitemapXml = await (await fetchOnce(`${ORIGIN}/sitemap.xml`)).text();
  const sitemap = new Set(
    [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => internalPath(m[1] ?? '') ?? '')
      .filter(Boolean),
  );

  await rm(join(OUT, 'html'), { recursive: true, force: true });
  for (const file of ['robots.txt', 'sitemap.xml', 'llms.txt']) {
    const res = await fetchOnce(`${ORIGIN}/${file}`);
    if (res.ok) await save(`site/${file}`, await res.text());
  }

  const pages = new Map<string, PageRecord>();
  const queue: string[] = ['/', ...sitemap];
  const seen = new Set(queue);
  const enqueue = (path: string | null) => {
    if (!path || seen.has(path) || ASSET.test(path)) return;
    seen.add(path);
    queue.push(path);
  };

  async function worker(): Promise<void> {
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      const res = await fetchOnce(ORIGIN + path);
      const inSitemap = sitemap.has(path);
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location') ?? '';
        const target = internalPath(new URL(location, ORIGIN + path).href);
        pages.set(path, {
          ...extract(path, '', res.status, inSitemap),
          redirectTo: target ?? location,
          htmlFile: null,
        });
        enqueue(target);
        continue;
      }
      const html = await res.text();
      const page = extract(path, res.status === 200 ? html : '', res.status, inSitemap);
      pages.set(path, page);
      if (res.status !== 200) continue;
      await save(`html/${page.htmlFile}`, html);
      page.internalLinks.forEach(enqueue);
      Object.values(page.hreflang).forEach((h) => enqueue(internalPath(h)));
      if (page.canonical) enqueue(internalPath(page.canonical));
      process.stdout.write(`\r${pages.size} pages, ${queue.length} queued   `);
    }
  }

  // Workers stop when the queue is momentarily empty; loop until no new work appears.
  while (queue.length) await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write('\n');

  const sorted = [...pages.values()].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  await save('urls.csv', toCsv(sorted));
  await save('pages.json', JSON.stringify(sorted, null, 2) + '\n');

  const count = (f: (p: PageRecord) => boolean) => sorted.filter(f).length;
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const p of sorted) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    if (p.status === 200) byType[`${p.lang}:${p.pageType}`] = (byType[`${p.lang}:${p.pageType}`] ?? 0) + 1;
  }
  const summary = {
    crawledAt: new Date().toISOString().slice(0, 10),
    origin: ORIGIN,
    urls: sorted.length,
    byStatus,
    pages200ByLangAndType: Object.fromEntries(Object.entries(byType).sort()),
    inSitemap: sitemap.size,
    notInSitemap200: sorted.filter((p) => p.status === 200 && !p.inSitemap).map((p) => p.url),
    sitemapNot200: [...sitemap].filter((u) => pages.get(u)?.status !== 200),
    invalidJsonLd: sorted.filter((p) => p.jsonLd.some((j) => !j.valid)).map((p) => p.url),
    h1NotOne: sorted.filter((p) => p.status === 200 && p.h1.length !== 1).map((p) => p.url),
    h2Anchors: count((p) => p.anchors.length > 0),
    h2AnchorsDifferingFromSlugger: sorted.flatMap((p) =>
      p.anchors.filter((a) => a.legacy !== a.slugger).map((a) => `${p.url}#${a.legacy}`),
    ),
    uniqueMedia: new Set(sorted.flatMap((p) => p.media)).size,
  };
  await save('snapshot.json', JSON.stringify(summary, null, 2) + '\n');
  console.log(
    JSON.stringify(
      { ...summary, h2AnchorsDifferingFromSlugger: summary.h2AnchorsDifferingFromSlugger.length },
      null,
      2,
    ),
  );
}

await main();
