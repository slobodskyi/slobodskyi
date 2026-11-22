// Export everything readable from the Webflow Data API v2 (Step 3), all locales.
//
//   pnpm webflow:export
//
// Writes data/legacy/webflow-export/:
//   site.json                       site settings incl. locales
//   collections/<slug>.json         collection schema + staged items per locale (incl. drafts)
//   pages.json                      static pages with localized SEO / Open Graph per locale
//   pages-dom/<slug>.<locale>.json  content nodes of static pages per locale
//   forms.json, assets.json, asset-folders.json
//   summary.json                    counts
// 301 redirects are not exported: the API requires an Enterprise plan.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { credentials, get, getAll } from './api.ts';

const OUT = join(import.meta.dirname, '..', '..', 'data', 'legacy', 'webflow-export');

interface Locale {
  id: string;
  cmsLocaleId: string;
  tag: string;
  subdirectory: string;
  displayName: string;
  enabled: boolean;
}
interface Site {
  locales?: { primary: Locale; secondary: Locale[] };
}
interface Collection {
  id: string;
  slug: string;
  displayName: string;
}
interface Item {
  id: string;
  isDraft?: boolean;
  isArchived?: boolean;
  lastPublished?: string | null;
  fieldData?: { slug?: string };
}
interface Page {
  id: string;
  slug?: string;
  title?: string;
  collectionId?: string | null;
  parentId?: string | null;
}

async function save(rel: string, data: unknown): Promise<void> {
  const file = join(OUT, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

const bySlug = (a: Item, b: Item) => (a.fieldData?.slug ?? a.id).localeCompare(b.fieldData?.slug ?? b.id);
const log = (msg: string) => console.log(msg);

async function main(): Promise<void> {
  const { siteId } = credentials();
  await rm(OUT, { recursive: true, force: true });

  const site = await get<Site>(`/sites/${siteId}`);
  await save('site.json', site);
  const locales = site.locales ? [site.locales.primary, ...site.locales.secondary] : [];
  log(`locales: ${locales.map((l) => `${l.tag}(/${l.subdirectory})`).join(', ')}`);

  const summary: Record<string, unknown> = { exportedAt: new Date().toISOString().slice(0, 10), locales: {} };
  for (const l of locales) (summary.locales as Record<string, string>)[l.tag] = `/${l.subdirectory}`;

  // Collections: schema + staged items for every CMS locale.
  const { collections } = await get<{ collections: Collection[] }>(`/sites/${siteId}/collections`);
  const collectionSummary: Record<string, Record<string, unknown>> = {};
  for (const c of [...collections].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const schema = await get<unknown>(`/collections/${c.id}`);
    const items: Record<string, Item[]> = {};
    for (const l of locales) {
      items[l.tag] = (
        await getAll<Item>(`/collections/${c.id}/items?cmsLocaleId=${l.cmsLocaleId}`, 'items')
      ).sort(bySlug);
    }
    await save(`collections/${c.slug}.json`, { collection: schema, items });
    const primary = items[locales[0]?.tag ?? ''] ?? [];
    collectionSummary[c.slug] = {
      items: primary.length,
      published: primary.filter((i) => i.lastPublished && !i.isDraft && !i.isArchived).length,
      drafts: primary.filter((i) => i.isDraft).map((i) => i.fieldData?.slug),
      archived: primary.filter((i) => i.isArchived).map((i) => i.fieldData?.slug),
    };
    log(`collection ${c.slug}: ${primary.length} items × ${locales.length} locales`);
  }
  summary.collections = collectionSummary;

  // Static pages: localized metadata and content nodes.
  // The primary locale must be requested without localeId (the API rejects it).
  const localeQuery = (l: Locale, sep: '?' | '&') => (l === locales[0] ? '' : `${sep}localeId=${l.id}`);
  const pagesByLocale: Record<string, Page[]> = {};
  for (const l of locales) {
    pagesByLocale[l.tag] = await getAll<Page>(`/sites/${siteId}/pages${localeQuery(l, '?')}`, 'pages');
  }
  await save('pages.json', pagesByLocale);
  const primaryPages = pagesByLocale[locales[0]?.tag ?? ''] ?? [];
  let domFiles = 0;
  for (const page of primaryPages) {
    for (const l of locales) {
      try {
        const nodes = await getAll<unknown>(`/pages/${page.id}/dom${localeQuery(l, '?')}`, 'nodes');
        await save(`pages-dom/${page.slug || 'index'}-${page.id}.${l.tag}.json`, {
          pageId: page.id,
          slug: page.slug,
          locale: l.tag,
          nodes,
        });
        domFiles++;
      } catch (error) {
        log(`  dom ${page.slug} ${l.tag}: ${(error as Error).message.slice(0, 120)}`);
      }
    }
  }
  summary.pages = {
    count: primaryPages.length,
    domFiles,
    templates: primaryPages.filter((p) => p.collectionId).length,
  };
  log(`pages: ${primaryPages.length}, dom files: ${domFiles}`);

  const forms = await getAll<unknown>(`/sites/${siteId}/forms`, 'forms');
  await save('forms.json', forms);
  const assets = await getAll<unknown>(`/sites/${siteId}/assets`, 'assets');
  await save('assets.json', assets);
  const folders = await get<unknown>(`/sites/${siteId}/asset_folders`);
  await save('asset-folders.json', folders);
  summary.forms = forms.length;
  summary.assets = assets.length;
  summary.redirects = 'not available via API (Enterprise only): export from the Webflow UI';

  await save('summary.json', summary);
  log(JSON.stringify(summary, null, 2));
}

await main();
