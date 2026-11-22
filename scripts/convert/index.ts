// Step 4: Webflow export + legacy snapshot → MDX records in content/.
//
//   pnpm convert            rewrite content/{guides,hubs,categories,pages} and data/convert-report.md
//
// Re-runnable: those four collections are wiped and regenerated on every run, so do not edit
// records there by hand until the migration is signed off. Sources (read-only):
//   data/legacy/webflow-export/collections/*.json  CMS items per locale (articles, hubs, categories)
//   data/legacy/webflow-export/pages.json          static pages (dates)
//   data/legacy/pages.json + html/                 live snapshot (SEO fields, service page bodies)
//   data/legacy/media-map.json + media/            CDN URL → local file
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  frontmatterSchema,
  serializeDocument,
  urlFor,
  withLangPrefix,
  type Collection,
  type Lang,
} from '@slobodskyi/core';
import type { Element, Root as HastRoot } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import { toText } from 'hast-util-to-text';
import { normalizeCdnUrl } from '../lib/cdn.ts';
import { htmlToMdx, parseFaq, type ConvertContext } from './mdx.ts';
import { writeReport } from './report.ts';

const ROOT = join(import.meta.dirname, '../..');
const LEGACY = join(ROOT, 'data/legacy');
const EXPORT = join(LEGACY, 'webflow-export');
const CONTENT = join(ROOT, 'content');
const OWNED: Collection[] = ['guides', 'hubs', 'categories', 'pages'];
const LANGS: Lang[] = ['en', 'uk', 'ru'];
const SITE_HOSTS = /^https?:\/\/(?:www\.)?slobodskyi\.com(?=[/?#]|$)/i;

// ---------- sources ----------

type FieldData = Record<string, unknown> & { name: string; slug: string };
interface CmsItem {
  id: string;
  isDraft: boolean;
  isArchived: boolean;
  createdOn: string;
  lastUpdated: string;
  fieldData: FieldData;
}
interface CmsCollection {
  collection: { slug: string; displayName: string };
  items: Record<Lang, CmsItem[]>;
}
interface SnapshotPage {
  url: string;
  status: number;
  pageType: string;
  title: string;
  description: string;
  robots: string;
  h1: string[];
  internalLinks: string[];
  anchors: { text: string; legacy: string; slugger: string }[];
  htmlFile: string;
}
interface WebflowPage {
  id: string;
  slug: string;
  publishedPath: string;
  createdOn: string;
  lastUpdated: string;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const collection = (slug: string) => readJson<CmsCollection>(join(EXPORT, 'collections', `${slug}.json`));

const snapshot = new Map(readJson<SnapshotPage[]>(join(LEGACY, 'pages.json')).map((p) => [p.url, p]));
const mediaMap = readJson<Record<string, { file: string; variantOf?: string }>>(
  join(LEGACY, 'media-map.json'),
);
const webflowPages = readJson<Record<Lang, WebflowPage[]>>(join(EXPORT, 'pages.json'));

const ARTICLE_COLLECTIONS = [
  'advertisement',
  'ai',
  'analytics',
  'marketplaces',
  'memberships',
  'no-code',
  'organic',
  'paid',
  'payments',
];

// ---------- report ----------

const issues: { address: string; kind: string; detail: string }[] = [];
const written: { address: string; url: string; status: string }[] = [];

// ---------- helpers ----------

const day = (iso: string) => iso.slice(0, 10);
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().replace(/\u00a0/g, ' ') : undefined;

/** Resolves a CDN URL to the downloaded original. */
function mediaFile(url: string): string | null {
  const candidates = [url, normalizeCdnUrl(url)];
  try {
    candidates.push(normalizeCdnUrl(decodeURI(url)), encodeURI(normalizeCdnUrl(decodeURI(url))));
  } catch {
    /* malformed escape: ignore */
  }
  for (const c of candidates) {
    let entry = mediaMap[c];
    if (entry?.variantOf) entry = mediaMap[entry.variantOf] ?? entry;
    if (entry) return join(LEGACY, entry.file);
  }
  return null;
}

function makeContext(address: string, dir: string, lang: Lang): ConvertContext {
  const ctx: ConvertContext = {
    issue: (kind, detail) => issues.push({ address, kind, detail }),
    asset(url) {
      const src = mediaFile(url);
      if (!src || !existsSync(src)) return null;
      mkdirSync(dir, { recursive: true });
      const name = basename(src);
      copyFileSync(src, join(dir, name));
      return name;
    },
    link(href) {
      const raw = href.trim();
      if (/website-files\.com|uploads-ssl\.webflow\.com/.test(raw)) {
        const file = ctx.asset(raw);
        if (file) return `./${file}`;
        ctx.issue('link', `CDN link not in media map: ${raw}`);
        return raw;
      }
      const relative = raw.startsWith('/') && !raw.startsWith('//');
      if (!relative && !SITE_HOSTS.test(raw)) return raw;
      let path = raw.replace(SITE_HOSTS, '') || '/';
      const hash = /#.*$/.exec(path)?.[0] ?? '';
      path = path.replace(/[?#].*$/, '');
      if (path.length > 1) path = path.replace(/\/+$/, '');
      // Webflow resolves relative links at publish time: "/<collection>/<item>" becomes the item's
      // template path, and pages in uk/ru get the locale prefix. Absolute links stay as written.
      if (relative) {
        path = articleRoutes.get(path) ?? path;
        if (lang !== 'en' && !/^\/(ua|ru)(\/|$)/.test(path)) path = withLangPrefix(lang, path);
      }
      // Owner decision: the ChatGPT 101 course never existed (404); its card points to the guide.
      if (path === '/ua/courses/chatgpt') path = withLangPrefix(lang, '/create/ai/chatgpt');
      return (path || '/') + hash;
    },
  };
  return ctx;
}

function write(collection: Collection, id: string, lang: Lang, data: Record<string, unknown>, body: string) {
  const address = `${collection}/${id}:${lang}`;
  const parsed = frontmatterSchema.safeParse(data);
  if (!parsed.success) {
    issues.push({
      address,
      kind: 'schema',
      detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
    return;
  }
  const file = join(CONTENT, collection, id, `${lang}.mdx`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, serializeDocument(data, body));
  written.push({
    address,
    url: urlFor(lang, collection, parsed.data),
    status: String(data.status),
    legacyUrls: parsed.data.legacyUrls,
  });
}

/** Drops undefined values so YAML stays clean; key order = insertion order. */
const compact = (o: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
  );

// ---------- hubs and categories (reference data) ----------

const hubsCms = collection('categories');
const catsCms = collection('sub-categories');
const hubById = new Map(hubsCms.items.en.map((i) => [i.id, i.fieldData.slug]));
const hubFromLink = (link: unknown) => /slobodskyi\.com\/([a-z-]+)\//.exec(String(link ?? ''))?.[1];
const catById = new Map(
  catsCms.items.en.map((i) => {
    const hub = hubById.get(String(i.fieldData.category)) ?? hubFromLink(i.fieldData.link);
    return [i.id, { slug: i.fieldData.slug, hub }];
  }),
);

/** "/<collection>/<item slug>" → "/<hub>/<category>/<slug>", for Webflow's relative CMS links. */
const articleRoutes = new Map<string, string>();
for (const coll of [
  'advertisement',
  'ai',
  'analytics',
  'marketplaces',
  'memberships',
  'no-code',
  'organic',
  'paid',
  'payments',
]) {
  for (const lang of LANGS) {
    for (const it of collection(coll).items[lang] ?? []) {
      const cat = catById.get(String(it.fieldData['sub-category']));
      const hub = hubById.get(String(it.fieldData.category)) ?? cat?.hub;
      if (cat && hub)
        articleRoutes.set(`/${coll}/${it.fieldData.slug}`, `/${hub}/${cat.slug}/${it.fieldData.slug}`);
    }
  }
}

// ---------- guides ----------

function convertGuides() {
  for (const coll of ARTICLE_COLLECTIONS) {
    const data = collection(coll);
    const ids = new Map<string, string>(); // Webflow item id → record id (en slug, else first locale)
    for (const lang of LANGS)
      for (const it of data.items[lang] ?? [])
        if (!ids.has(it.id) || lang === 'en') ids.set(it.id, it.fieldData.slug);
    // Localized copies whose body is the English one verbatim are not translations: they are not
    // converted, and their URLs 301 to the English guide (owner decision 2026-11-22).
    const enById = new Map((data.items.en ?? []).map((it) => [it.id, it]));
    const untranslated = new Map<string, string[]>(); // Webflow item id → legacy paths
    const skip = new Set<string>(); // "<item id>:<lang>"
    for (const lang of LANGS) {
      if (lang === 'en') continue;
      for (const it of data.items[lang] ?? []) {
        const en = enById.get(it.id);
        if (!en || typeof en.fieldData['post-body'] !== 'string') continue;
        if (it.fieldData['post-body'] !== en.fieldData['post-body']) continue;
        const cat = catById.get(String(it.fieldData['sub-category']));
        const hub = hubById.get(String(it.fieldData.category)) ?? cat?.hub;
        if (!cat || !hub) continue;
        const path = withLangPrefix(lang, `/${hub}/${cat.slug}/${it.fieldData.slug}`);
        skip.add(`${it.id}:${lang}`);
        if (snapshot.get(path)?.status === 200)
          untranslated.set(it.id, [...(untranslated.get(it.id) ?? []), path]);
      }
    }
    for (const lang of LANGS) {
      for (const it of data.items[lang] ?? []) {
        const id = ids.get(it.id) ?? it.fieldData.slug;
        const fd = it.fieldData;
        const address = `guides/${id}:${lang}`;
        const dir = join(CONTENT, 'guides', id);
        const ctx = makeContext(address, dir, lang);
        if (skip.has(`${it.id}:${lang}`)) {
          ctx.issue(
            'untranslated',
            'body equals the English one; not converted (a live URL redirects to the English guide)',
          );
          continue;
        }
        const cat = catById.get(String(fd['sub-category']));
        const hub = hubById.get(String(fd.category)) ?? cat?.hub;
        if (!cat || !hub) {
          ctx.issue(
            'reference',
            `no category/hub reference (category=${String(fd.category)}, sub-category=${String(fd['sub-category'])}); record skipped`,
          );
          continue;
        }
        if (cat.hub && cat.hub !== hub)
          ctx.issue('reference', `hub ${hub} differs from category's hub ${cat.hub}`);
        if (fd.slug !== id) ctx.issue('slug', `slug ${fd.slug} differs from id ${id}`);
        const title = str(fd.name) ?? fd.slug;
        const metaTitle = str(fd['meta-title']);
        const summary = str(fd['post-summary']);
        const image = fd['main-image'] as { url?: string; alt?: string | null } | null;
        const cover = image?.url ? ctx.asset(image.url) : null;
        if (image?.url && !cover) ctx.issue('image', `cover not in media map: ${image.url}`);
        const status = it.isArchived ? 'archived' : it.isDraft ? 'draft' : 'published';
        const fm = compact({
          type: 'guide',
          title,
          seoTitle: metaTitle && metaTitle !== title ? metaTitle : undefined,
          description: str(fd['meta-description']) ?? summary,
          lead: summary,
          cover: cover ? `./${cover}` : undefined,
          coverAlt: str(image?.alt),
          hub,
          category: cat.slug,
          slug: fd.slug,
          stage: status === 'published' ? 'evergreen' : 'seedling',
          visibility: 'public',
          status,
          created: day(it.createdOn),
          updated: day(it.lastUpdated),
          faq: typeof fd.faq === 'string' ? parseFaq(fd.faq, ctx) : undefined,
          legacyUrls: lang === 'en' ? untranslated.get(it.id) : undefined,
          ai: { assisted: false },
        });
        const live = snapshot.get(withLangPrefix(lang, `/${hub}/${cat.slug}/${fd.slug}`));
        const allowed = live ? new Set(live.anchors.map((a) => a.legacy)) : undefined;
        const body = typeof fd['post-body'] === 'string' ? htmlToMdx(fd['post-body'], ctx, allowed) : '';
        if (!body.trim()) ctx.issue('body', 'empty article body');
        write('guides', id, lang, fm, body);
      }
    }
  }
}

// ---------- pages from the live snapshot (hubs, categories, service pages) ----------

const DROP_CLASSES = [
  'w-dyn-list',
  'w-form',
  'breadcrumbs-container',
  'w-condition-invisible',
  'table-of-contents',
];
const DROP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'svg',
  'form',
  'nav',
  'h1',
  'button',
  'input',
  'template',
]);

function prune(node: HastRoot | Element) {
  node.children = node.children.filter((c) => {
    if (c.type !== 'element') return c.type === 'text';
    if (DROP_TAGS.has(c.tagName)) return false;
    const cls = Array.isArray(c.properties?.className) ? c.properties.className.map(String) : [];
    if (cls.some((k) => DROP_CLASSES.includes(k))) return false;
    prune(c);
    return true;
  });
}

/** The page's content containers (main.content or section.content), cleaned of generated parts. */
function mainHtml(page: SnapshotPage, allowLanding: boolean): string {
  const doc = fromHtml(readFileSync(join(LEGACY, 'html', page.htmlFile), 'utf8'));
  const found: Element[] = [];
  const find = (n: HastRoot | Element) => {
    for (const c of n.children) {
      if (c.type !== 'element') continue;
      const cls = Array.isArray(c.properties?.className) ? c.properties.className.map(String) : [];
      if ((c.tagName === 'main' || c.tagName === 'section') && cls.includes('content')) found.push(c);
      else find(c);
    }
  };
  find(doc);
  for (const el of found) prune(el);
  const html = found.map((el) => toHtml(el.children)).join('');
  if (!allowLanding || toText(fromHtml(html, { fragment: true })).trim().length > 200) return html;
  // Landing pages (courses) keep their text in layout sections outside .content: take the whole
  // body without the site chrome.
  const body = findTag(doc, 'body');
  if (!body) return html;
  body.children = body.children.filter(
    (c) =>
      !(
        c.type === 'element' &&
        (['header', 'footer'].includes(c.tagName) || classes(c).some((k) => LANDING_CHROME.includes(k)))
      ),
  );
  prune(body);
  landing.add(page.url);
  return toHtml(body.children);
}

const LANDING_CHROME = ['site-navbar', 'footer', 'w-nav'];
const landing = new Set<string>();
const classes = (el: Element) =>
  Array.isArray(el.properties?.className) ? el.properties.className.map(String) : [];
function findTag(n: HastRoot | Element, tag: string): Element | undefined {
  for (const c of n.children) {
    if (c.type !== 'element') continue;
    if (c.tagName === tag) return c;
    const f = findTag(c, tag);
    if (f) return f;
  }
  return undefined;
}

function webflowDates(route: string, lang: Lang): { created: string; updated: string } | undefined {
  const en = webflowPages.en.find(
    (p) => (p.publishedPath || '/') === route || (route === '/' && p.slug === 'index'),
  );
  if (!en) return undefined;
  const loc = webflowPages[lang].find((p) => p.id === en.id) ?? en;
  return { created: day(loc.createdOn), updated: day(loc.lastUpdated) };
}

/** Plain text of the first paragraph, cut at a sentence end before ~160 characters. */
function firstSentences(body: string): string | undefined {
  const para = body
    .split(/\n{2,}/)
    .map((p) =>
      p
        .replace(/<[^>]+>/g, '')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_`#>]/g, '')
        .trim(),
    )
    .find((p) => p.length > 40);
  if (!para) return undefined;
  const text = para.replace(/\s+/g, ' ');
  if (text.length <= 160) return text;
  const cut = text.slice(0, 160);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 60 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}

/** SEO fields from the live page: title = H1, seoTitle = <title> when different. */
function seoFrom(page: SnapshotPage) {
  const h1 = page.h1[0]?.trim();
  const title = page.title.trim();
  return {
    title: h1 || title,
    seoTitle: h1 && title !== h1 ? title : undefined,
    description: page.description || undefined,
  };
}

function convertFromSnapshot(
  collection: Collection,
  id: string,
  route: string,
  extra: (lang: Lang) => Record<string, unknown>,
  draft?: { title: string; description: string | undefined; created: string; updated: string },
) {
  for (const lang of LANGS) {
    const url = withLangPrefix(lang, route);
    const page = snapshot.get(url);
    const address = `${collection}/${id}:${lang}`;
    const dir = join(CONTENT, collection, id);
    const ctx = makeContext(address, dir, lang);
    if (!page || page.status !== 200) {
      if (!draft) {
        ctx.issue('snapshot', `no live page ${url}; record skipped`);
        continue;
      }
      const { cover, ...rest } = extra(lang);
      const coverFile = typeof cover === 'string' ? ctx.asset(cover) : null;
      write(
        collection,
        id,
        lang,
        compact({
          ...rest,
          title: draft.title,
          description: draft.description,
          cover: coverFile ? `./${coverFile}` : undefined,
          stage: 'seedling',
          visibility: 'public',
          status: 'draft',
          created: draft.created,
          updated: draft.updated,
          ai: { assisted: false },
        }),
        '',
      );
      continue;
    }
    const dates = webflowDates(route, lang);
    if (!dates) ctx.issue('dates', `no Webflow page for ${route}; dates set to the export day`);
    const { cover, type, ...rest } = extra(lang);
    const coverFile = typeof cover === 'string' ? ctx.asset(cover) : null;
    const noindex = page.robots.includes('noindex');
    const fix = FIXES[url];
    let body = htmlToMdx(
      mainHtml(page, collection === 'pages' && !fix?.body),
      ctx,
      new Set(page.anchors.map((a) => a.legacy)),
    );
    if (landing.has(page.url))
      ctx.issue(
        'landing',
        'landing page: body is a text extraction of the whole page; rebuild layout in Step 5',
      );
    const seo = seoFrom(page);
    if (fix) {
      if (fix.title) seo.title = fix.title;
      if (fix.seoTitle !== undefined) seo.seoTitle = fix.seoTitle ?? undefined;
      if (fix.description) seo.description = fix.description;
      if (fix.body) body = fix.body;
    }
    if (!seo.description) {
      seo.description = firstSentences(body);
      if (seo.description) {
        FIXES[url] ??= { why: 'live page has no meta description; taken from the first paragraph' };
      } else ctx.issue('description', 'live page has no meta description and no text to take one from');
    }
    write(
      collection,
      id,
      lang,
      compact({
        type,
        ...seo,
        cover: coverFile ? `./${coverFile}` : undefined,
        ...rest,
        stage: 'evergreen',
        visibility: 'public',
        status: 'published',
        noindex: noindex || undefined,
        // Indexable but absent from the live sitemap (e.g. hidden course pages): keep it that way.
        sitemap: !noindex && !page.inSitemap ? false : undefined,
        created: dates?.created ?? '2026-11-22',
        updated: dates?.updated ?? '2026-11-22',
        ai: fix?.body
          ? { assisted: true, source: 'convert: replaces a Webflow placeholder page' }
          : { assisted: false },
      }),
      body,
    );
  }
}

/** Webflow "name" of a CMS item in a locale: the short label used in menus and breadcrumbs. */
const cmsName = (cms: CmsCollection, itemId: string, lang: Lang): string | undefined =>
  str((cms.items[lang] ?? []).find((i) => i.id === itemId)?.fieldData.name) ??
  str(cms.items.en.find((i) => i.id === itemId)?.fieldData.name);

function convertHubsAndCategories() {
  for (const it of hubsCms.items.en) {
    const hub = it.fieldData.slug;
    if (it.isDraft && !['create', 'connect', 'monetize', 'grow'].includes(hub)) {
      issues.push({
        address: `hubs/${hub}`,
        kind: 'schema',
        detail: `draft hub "${hub}" is not in HUBS (create, connect, monetize, grow); not converted`,
      });
      continue;
    }
    const image = (it.fieldData['category-image'] as { url?: string } | null)?.url;
    convertFromSnapshot('hubs', hub, `/${hub}`, (lang) => ({
      type: 'hub',
      label: cmsName(hubsCms, it.id, lang),
      hub,
      cover: image,
    }));
  }
  for (const it of catsCms.items.en) {
    const cat = catById.get(it.id);
    if (!cat) continue;
    const image = (it.fieldData['sub-category-cover'] as { url?: string } | null)?.url;
    if (!cat.hub) {
      issues.push({ address: `categories/${cat.slug}`, kind: 'reference', detail: 'no hub; not converted' });
      continue;
    }
    const draft = it.isDraft
      ? {
          title: it.fieldData.name,
          description: str(it.fieldData.dd),
          created: day(it.createdOn),
          updated: day(it.lastUpdated),
        }
      : undefined;
    convertFromSnapshot(
      'categories',
      cat.slug,
      `/${cat.hub}/${cat.slug}`,
      (lang) => ({
        type: 'category',
        label: cmsName(catsCms, it.id, lang),
        hub: cat.hub,
        category: cat.slug,
        cover: image,
      }),
      draft,
    );
  }
}

/**
 * Legacy defects fixed on purpose (CLAUDE.md, owner decisions 2026-11-22). Every entry shows up in
 * the report as an expected difference from the live site. The en/ru legal pages are Webflow
 * placeholders ("hello" / "here", H1 "public-offer-agreement"); the real text exists only in uk.
 */
interface Fix {
  title?: string;
  seoTitle?: string | null;
  description?: string;
  body?: string;
  why: string;
}
const UA_ONLY = (label: string, path: string, lang: 'en' | 'ru') =>
  lang === 'en'
    ? `The full text is available in Ukrainian: [${label}](${path}).\n`
    : `Полный текст доступен на украинском языке: [${label}](${path}).\n`;
const PAYMENT_SUCCESS: Record<Lang, Required<Pick<Fix, 'title' | 'description' | 'body'>>> = {
  en: {
    title: 'Payment successful',
    description: 'Thank you for your payment. Access details are on their way to your email.',
    body: 'Thank you for your payment! Access details are on their way to your email. If anything is missing, [contact me](/contacts).\n',
  },
  uk: {
    title: 'Оплата успішна',
    description: 'Дякую за оплату. Деталі доступу вже надіслано на вашу пошту.',
    body: 'Дякую за оплату! Деталі доступу вже надіслано на вашу пошту. Якщо щось не так, [напишіть мені](/ua/contacts).\n',
  },
  ru: {
    title: 'Оплата прошла успешно',
    description: 'Спасибо за оплату. Детали доступа уже отправлены на вашу почту.',
    body: 'Спасибо за оплату! Детали доступа уже отправлены на вашу почту. Если что-то не так, [напишите мне](/ru/contacts).\n',
  },
};
export const FIXES: Record<string, Fix> = {
  '/courses/privacy-policy': {
    title: 'Privacy Policy',
    seoTitle: null,
    description:
      'Privacy policy for courses and consultations by Oleksandr Slobodskyi. The full text is available in Ukrainian.',
    body: UA_ONLY('Політика конфіденційності', '/ua/courses/privacy-policy', 'en'),
    why: 'placeholder page: <title> "privacy-policy", H1 "public-offer-agreement", no description, body "hello/here"',
  },
  '/ru/courses/privacy-policy': {
    title: 'Политика конфиденциальности',
    seoTitle: null,
    description:
      'Политика конфиденциальности курсов и консультаций Александра Слободского. Полный текст доступен на украинском языке.',
    body: UA_ONLY('Політика конфіденційності', '/ua/courses/privacy-policy', 'ru'),
    why: 'placeholder page: <title> "privacy-policy", H1 "public-offer-agreement", no description, body "hello/here"',
  },
  '/courses/public-offer': {
    title: 'Public offer',
    description:
      'Public offer agreement for courses and consultations by Oleksandr Slobodskyi. The full text is available in Ukrainian.',
    body: UA_ONLY('Публічна оферта', '/ua/courses/public-offer', 'en'),
    why: 'placeholder page: H1 "public-offer-agreement", no description, body "hello/here"; <title> kept',
  },
  '/ru/courses/public-offer': {
    title: 'Публичная оферта',
    seoTitle: 'Public offer',
    description:
      'Публичная оферта на курсы и консультации Александра Слободского. Полный текст доступен на украинском языке.',
    body: UA_ONLY('Публічна оферта', '/ua/courses/public-offer', 'ru'),
    why: 'placeholder page: H1 "public-offer-agreement", no description, body "hello/here"; <title> kept',
  },
  '/ua/tools': {
    seoTitle: 'Інструменти для кріейторів',
    why: '<title> was copied from /ua/courses ("Курси для кріейторів")',
  },
  ...Object.fromEntries(
    (['en', 'uk', 'ru'] as const).map((lang) => [
      withLangPrefix(lang, '/courses/payment-success-67dd392a3c9d80c3ee009047'),
      {
        ...PAYMENT_SUCCESS[lang],
        seoTitle: null,
        why: 'blank page on the live site: <title> "payment-success", no H1, no description, no text',
      },
    ]),
  ),
  '/courses/payment-problem': {
    seoTitle: null,
    description: 'Something went wrong while processing your payment. Contact me and I will help.',
    why: '<title> "/payment-problem", no description',
  },
  '/ru/courses/payment-problem': {
    seoTitle: null,
    description: 'Во время обработки оплаты произошла ошибка. Напишите мне, и я помогу.',
    why: '<title> "/payment-problem", no description',
  },
  ...Object.fromEntries(
    (['en', 'uk', 'ru'] as const).map((lang) => [
      withLangPrefix(lang, '/courses'),
      {
        why: 'ChatGPT 101 card linked to the 404 /ua/courses/chatgpt; now the ChatGPT guide (owner decision)',
      },
    ]),
  ),
  '/ru/tools': {
    seoTitle: 'Инструменты для криейторов',
    why: '<title> was copied from /ru/courses ("Курсы для криейторов")',
  },
};

// Service pages: id = Webflow page slug (en), path = legacy route.
const PAGES: [id: string, path: string][] = [
  ['home', '/'],
  ['about', '/about'],
  ['contacts', '/contacts'],
  ['tools', '/tools'],
  ['affiliate-disclosure', '/affiliate-disclosure'],
  ['courses', '/courses'],
  ['consultation', '/courses/consultation'],
  ['onlyfans', '/courses/onlyfans'],
  ['public-offer', '/courses/public-offer'],
  ['privacy-policy', '/courses/privacy-policy'],
  ['how-to-create-images-with-ai', '/courses/how-to-create-images-with-ai'],
  ['payment-alternatives', '/courses/payment-alternatives'],
  // Unlinked Webflow pages, found after the first snapshot (no sitemap entry, noindex on the live site).
  ['payment-success', '/courses/payment-success-67dd392a3c9d80c3ee009047'],
  ['payment-problem', '/courses/payment-problem'],
  ['search', '/search'],
  ['terms-of-service', '/terms-of-service'],
];

function convertPages() {
  for (const [id, path] of PAGES) convertFromSnapshot('pages', id, path, () => ({ type: 'page', path }));
}

// ---------- run ----------

for (const c of OWNED) {
  rmSync(join(CONTENT, c), { recursive: true, force: true });
  mkdirSync(join(CONTENT, c), { recursive: true });
  writeFileSync(join(CONTENT, c, '.gitkeep'), '');
}
convertGuides();
convertHubsAndCategories();
convertPages();

writeReport({ root: ROOT, issues, written, snapshot, fixes: FIXES });
