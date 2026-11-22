// RSS 2.0 feeds per language: all posts (<prefix>/rss.xml) and one per collection
// (<prefix>/rss/<collection>.xml). Service pages, hubs and categories are not posts.
import type { APIRoute, GetStaticPaths } from 'astro';
import { LANG_PREFIX, LANGS, type Collection, type Lang } from '@slobodskyi/core';
import { absoluteUrl, publishedRecords, type Rec } from '../lib/content';
import { HTML_LANG } from '../lib/i18n';

const NOT_POSTS: Collection[] = ['pages', 'hubs', 'categories'];
const TITLE: Record<Lang, string> = {
  en: 'Oleksandr Slobodskyi',
  uk: 'Олександр Слободський',
  ru: 'Александр Слободской',
};

const posts = async (lang: Lang, collection?: Collection): Promise<Rec[]> =>
  (await publishedRecords())
    .filter(
      (r) =>
        r.lang === lang &&
        !NOT_POSTS.includes(r.collection) &&
        !r.data.noindex &&
        (!collection || r.collection === collection),
    )
    .sort((a, b) => (a.data.created < b.data.created ? 1 : a.data.created > b.data.created ? -1 : 0));

export const getStaticPaths = (async () => {
  const all = await publishedRecords();
  const paths = [];
  for (const lang of LANGS) {
    const prefix = LANG_PREFIX[lang].slice(1);
    const at = (p: string) => (prefix ? `${prefix}/${p}` : p);
    paths.push({ params: { feed: at('rss') }, props: { lang } });
    const collections = new Set(
      all.filter((r) => r.lang === lang && !NOT_POSTS.includes(r.collection)).map((r) => r.collection),
    );
    for (const collection of collections)
      paths.push({ params: { feed: at(`rss/${collection}`) }, props: { lang, collection } });
  }
  return paths;
}) satisfies GetStaticPaths;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ props, params }) => {
  const { lang, collection } = props as { lang: Lang; collection?: Collection };
  const items = await posts(lang, collection);
  const home = absoluteUrl(LANG_PREFIX[lang] || '/');
  const self = absoluteUrl(`/${params.feed}.xml`);
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${esc(TITLE[lang] + (collection ? ` — ${collection}` : ''))}</title>`,
    `<link>${home}</link>`,
    `<atom:link href="${self}" rel="self" type="application/rss+xml"/>`,
    `<description>${esc(TITLE[lang])}</description>`,
    `<language>${HTML_LANG[lang]}</language>`,
    ...items.map((r) =>
      [
        '<item>',
        `<title>${esc(r.data.title)}</title>`,
        `<link>${absoluteUrl(r.url)}</link>`,
        `<guid isPermaLink="true">${absoluteUrl(r.url)}</guid>`,
        `<pubDate>${new Date(`${r.data.created}T00:00:00Z`).toUTCString()}</pubDate>`,
        r.data.description || r.data.lead
          ? `<description>${esc(r.data.lead ?? r.data.description ?? '')}</description>`
          : '',
        '</item>',
      ].join(''),
    ),
    '</channel>',
    '</rss>',
    '',
  ].join('\n');
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
