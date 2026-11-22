// Breadcrumb trails: Home → hub → category → (current page, added by the caller for JSON-LD).
import { withLangPrefix } from '@slobodskyi/core';
import { absoluteUrl, categoryRecord, hubRecord, type Rec } from './content';
import { categoryLabel, HUB_LABEL, t } from './i18n';
import type { Crumb } from './schema-org';

export async function crumbsFor(rec: Rec): Promise<Crumb[]> {
  const home: Crumb = { name: t(rec.lang).home, url: absoluteUrl(withLangPrefix(rec.lang, '/')) };
  const d = rec.data;
  if (d.type === 'page' && d.path === '/') return [];
  const crumbs = [home];
  if (d.type === 'guide' || d.type === 'category') {
    const hub = await hubRecord(rec.lang, d.hub);
    if (hub) crumbs.push({ name: HUB_LABEL[d.hub][rec.lang], url: absoluteUrl(hub.url) });
  }
  if (d.type === 'guide') {
    const cat = await categoryRecord(rec.lang, d.hub, d.category);
    if (cat)
      crumbs.push({ name: categoryLabel(d.category, rec.lang, cat.data.title), url: absoluteUrl(cat.url) });
  }
  return crumbs;
}

/** Name of the current page in breadcrumbs. */
export function crumbName(rec: Rec): string {
  const d = rec.data;
  if (d.type === 'hub') return HUB_LABEL[d.hub][rec.lang];
  if (d.type === 'category') return categoryLabel(d.category, rec.lang, d.title);
  return d.title;
}
