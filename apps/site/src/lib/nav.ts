// Breadcrumb trails: Home → hub → category → (current page, added by the caller for JSON-LD).
import { withLangPrefix } from '@slobodskyi/core';
import { absoluteUrl, categoryRecord, hubRecord, labelOf, type Rec } from './content';
import { t } from './i18n';
import type { Crumb } from './schema-org';

export async function crumbsFor(rec: Rec): Promise<Crumb[]> {
  const home: Crumb = { name: t(rec.lang).home, url: absoluteUrl(withLangPrefix(rec.lang, '/')) };
  const d = rec.data;
  if (d.type === 'page' && d.path === '/') return [];
  const crumbs = [home];
  if (d.type === 'guide' || d.type === 'category') {
    const hub = await hubRecord(rec.lang, d.hub);
    if (hub) crumbs.push({ name: labelOf(hub), url: absoluteUrl(hub.url) });
  }
  if (d.type === 'guide') {
    const cat = await categoryRecord(rec.lang, d.hub, d.category);
    if (cat) crumbs.push({ name: labelOf(cat), url: absoluteUrl(cat.url) });
  }
  return crumbs;
}
