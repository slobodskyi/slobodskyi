// Shared helpers for the parity and build checks: map URLs to built files, read `_redirects`,
// extract the SEO facts of a page. Works on any dist folder (Astro `build.format: 'file'`).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { attr, byTag, findAll, meta, parseHtml, rawText, textOf, type Node } from '../lib/html.ts';

export const ORIGIN = 'https://slobodskyi.com';

/** Absolute same-site URL or path → normalised path ("/" for the home page, no trailing slash). */
export function toPath(href: string): string {
  let p = href.startsWith(ORIGIN) ? href.slice(ORIGIN.length) : href;
  p = p.replace(/[?#].*$/, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/** `/` → index.html, `/ua` → ua.html, `/a/b` → a/b.html. */
export function fileForUrl(url: string): string {
  const p = toPath(url);
  return p === '/' ? 'index.html' : `${p.slice(1)}.html`;
}

/** Built HTML file for a URL, or null when the page does not exist. */
export function findBuiltFile(dist: string, url: string): string | null {
  const file = join(dist, fileForUrl(url));
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

export function urlForFile(dist: string, file: string): string {
  const rel = relative(dist, file)
    .split('\\')
    .join('/')
    .replace(/\.html$/, '');
  if (rel === 'index') return '/';
  return `/${rel.replace(/\/index$/, '')}`;
}

export interface Redirect {
  from: string;
  to: string;
  status: number;
}

/** Static rules of a Cloudflare `_redirects` file (splat/placeholder rules are ignored). */
export function readRedirects(dist: string): Map<string, Redirect> {
  const file = join(dist, '_redirects');
  const rules = new Map<string, Redirect>();
  if (!existsSync(file)) return rules;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [from, to, status = '301'] = t.split(/\s+/);
    if (!from || !to || /[*:]/.test(from)) continue;
    rules.set(toPath(from), { from: toPath(from), to, status: Number(status) });
  }
  return rules;
}

export function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out.sort();
}

export interface PageFacts {
  title: string;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  h1: string[];
  hreflang: Record<string, string>;
}

export const parsePage = (html: string): Node => parseHtml(html);

export function extractFacts(doc: Node): PageFacts {
  const title = byTag(doc, 'title')[0];
  const links = byTag(doc, 'link');
  const canonical = links.find((l) => attr(l, 'rel')?.toLowerCase() === 'canonical');
  const hreflang: Record<string, string> = {};
  for (const l of links) {
    const lang = attr(l, 'hreflang');
    const href = attr(l, 'href');
    if (attr(l, 'rel')?.toLowerCase() === 'alternate' && lang && href) hreflang[lang] = toPath(href);
  }
  return {
    title: title ? textOf(title) : '',
    description: meta(doc, 'name', 'description') ?? null,
    canonical: canonical ? (attr(canonical, 'href') ?? null) : null,
    robots: meta(doc, 'name', 'robots') ?? null,
    h1: byTag(doc, 'h1').map(textOf),
    hreflang,
  };
}

export const jsonLdScripts = (doc: Node): string[] =>
  findAll(doc, (n) => n.tagName === 'script' && attr(n, 'type') === 'application/ld+json').map(rawText);
