import { LANG_PREFIX, SITE, type Collection, type Lang } from './constants.ts';
import type { Frontmatter } from './schema.ts';

/** Route of a record without the language prefix. */
export function routeFor(collection: Collection, fm: Frontmatter): string {
  switch (fm.type) {
    case 'guide':
      return `/${fm.hub}/${fm.category}/${fm.slug}`;
    case 'hub':
      return `/${fm.hub}`;
    case 'category':
      return `/${fm.hub}/${fm.category}`;
    case 'page':
    case 'now':
      return fm.path;
    default:
      // Provisional scheme for types that have no published records yet (essays, log, til, …).
      // Changing it after the first publication requires legacyUrls.
      return `/${collection}/${fm.slug}`;
  }
}

/** Public URL path of a record: language prefix + route. Home is "/", "/ua", "/ru". */
export function urlFor(lang: Lang, collection: Collection, fm: Frontmatter): string {
  return withLangPrefix(lang, routeFor(collection, fm));
}

export function withLangPrefix(lang: Lang, route: string): string {
  const prefix = LANG_PREFIX[lang];
  if (!prefix) return route;
  return route === '/' ? prefix : prefix + route;
}

/**
 * Normalises a link target to an internal site path, or returns null for external links,
 * anchors-only, mailto:, etc. Strips origin, query, hash and the trailing slash.
 */
export function internalPath(href: string): string | null {
  let target = href.trim();
  if (target.startsWith(SITE)) target = target.slice(SITE.length) || '/';
  else if (target.startsWith('https://www.slobodskyi.com')) target = target.slice(26) || '/';
  if (!target.startsWith('/') || target.startsWith('//')) return null;
  target = target.replace(/[?#].*$/, '');
  if (target.length > 1) target = target.replace(/\/+$/, '');
  return target || '/';
}
