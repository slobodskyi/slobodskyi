// Published records of the `content` collection with their computed URLs, translations and
// relations. Every page and feed goes through here, so isPublished() is applied in one place.
import { getCollection, type CollectionEntry } from 'astro:content';
import {
  extractHeadings,
  isCollection,
  isLang,
  isPublished,
  LANGS,
  SITE,
  urlFor,
  type Collection,
  type Frontmatter,
  type Heading,
  type Lang,
} from '@slobodskyi/core';

export interface Rec {
  entry: CollectionEntry<'content'>;
  data: Frontmatter;
  /** Record address "<collection>/<id>:<lang>". */
  address: string;
  collection: Collection;
  id: string;
  lang: Lang;
  /** Public path, e.g. "/ua/create/ai/chatgpt"; "/" for the English home page. */
  url: string;
  /** Folder of the record relative to the repository root, e.g. "content/guides/chatgpt". */
  dir: string;
}

const ADDRESS = /^([a-z]+)\/([a-z0-9-]+):([a-z]+)$/;

let cache: Promise<Rec[]> | undefined;

/** All published public records, sorted by address. */
export function publishedRecords(): Promise<Rec[]> {
  cache ??= getCollection('content').then((entries) =>
    entries
      .filter((entry) => isPublished(entry.data))
      .map((entry): Rec => {
        const m = ADDRESS.exec(entry.id);
        if (!m) throw new Error(`unexpected entry id ${entry.id}`);
        const [, collection = '', id = '', lang = ''] = m;
        if (!isCollection(collection) || !isLang(lang)) throw new Error(`bad address ${entry.id}`);
        return {
          entry,
          data: entry.data,
          address: entry.id,
          collection,
          id,
          lang,
          url: urlFor(lang, collection, entry.data),
          dir: `content/${collection}/${id}`,
        };
      })
      .sort((a, b) => (a.address < b.address ? -1 : 1)),
  );
  return cache;
}

export const absoluteUrl = (path: string): string => (path === '/' ? SITE : SITE + path);

/** The same record in every published language, in LANGS order. */
export async function translationsOf(rec: Rec): Promise<Rec[]> {
  const all = await publishedRecords();
  return LANGS.flatMap((lang) =>
    all.filter((r) => r.collection === rec.collection && r.id === rec.id && r.lang === lang),
  );
}

export async function homeOf(lang: Lang): Promise<Rec | undefined> {
  const all = await publishedRecords();
  return all.find((r) => r.lang === lang && r.data.type === 'page' && r.data.path === '/');
}

export async function findPage(lang: Lang, path: string): Promise<Rec | undefined> {
  const all = await publishedRecords();
  return all.find((r) => r.lang === lang && r.data.type === 'page' && r.data.path === path);
}

export async function hubsOf(lang: Lang): Promise<Rec[]> {
  const all = await publishedRecords();
  return all.filter((r) => r.lang === lang && r.data.type === 'hub');
}

export async function hubRecord(lang: Lang, hub: string): Promise<Rec | undefined> {
  const all = await publishedRecords();
  return all.find((r) => r.lang === lang && r.data.type === 'hub' && r.data.hub === hub);
}

export async function categoriesOf(lang: Lang, hub: string): Promise<Rec[]> {
  const all = await publishedRecords();
  return all.filter((r) => r.lang === lang && r.data.type === 'category' && r.data.hub === hub);
}

export async function categoryRecord(lang: Lang, hub: string, category: string): Promise<Rec | undefined> {
  const all = await publishedRecords();
  return all.find(
    (r) =>
      r.lang === lang && r.data.type === 'category' && r.data.hub === hub && r.data.category === category,
  );
}

const byUpdatedDesc = (a: Rec, b: Rec): number =>
  a.data.updated === b.data.updated
    ? a.address < b.address
      ? -1
      : 1
    : a.data.updated < b.data.updated
      ? 1
      : -1;

/** Published, indexable guides of a language, newest first; optionally limited to a hub/category. */
export async function guidesOf(lang: Lang, hub?: string, category?: string): Promise<Rec[]> {
  const all = await publishedRecords();
  return all
    .filter(
      (r) =>
        r.lang === lang &&
        r.data.type === 'guide' &&
        !r.data.noindex &&
        (!hub || r.data.hub === hub) &&
        (!category || r.data.category === category),
    )
    .sort(byUpdatedDesc);
}

/** Up to `count` related guides: frontmatter `related` first, then same category, then same hub. */
export async function relatedOf(rec: Rec, count = 3): Promise<Rec[]> {
  if (rec.data.type !== 'guide') return [];
  const { hub, category } = rec.data;
  const all = await publishedRecords();
  const picked: Rec[] = [];
  const add = (r: Rec | undefined) => {
    if (r && r.address !== rec.address && !picked.some((p) => p.address === r.address)) picked.push(r);
  };
  for (const ref of rec.data.related) {
    const [collection, id] = ref.split('/');
    add(all.find((r) => r.collection === collection && r.id === id && r.lang === rec.lang));
  }
  for (const r of await guidesOf(rec.lang, hub, category)) add(r);
  for (const r of await guidesOf(rec.lang, hub)) add(r);
  return picked.slice(0, count);
}

/** Headings of the body: the single source of anchors (core extractHeadings). */
export const headingsOf = (rec: Rec): Heading[] => extractHeadings(rec.entry.body ?? '');

/** Reading time in minutes, ~200 words per minute of prose (JSX and Markdown syntax stripped). */
export function readingTime(rec: Rec): number {
  const text = (rec.entry.body ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`|-]+/g, ' ');
  const faq = 'faq' in rec.data ? rec.data.faq.map((f) => `${f.q} ${f.a}`).join(' ') : '';
  const words = `${text} ${faq}`.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
