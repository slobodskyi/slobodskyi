// Head data of a record page: title, description, canonical, robots, hreflang, Open Graph.
import { getImage } from 'astro:assets';
import type { Lang } from '@slobodskyi/core';
import { absoluteUrl, translationsOf, type Rec } from './content';
import { resolveImage, isOptimizable } from './images';
import defaultOg from '../assets/home-hero.jpg';

export interface HeadData {
  lang: Lang;
  title: string;
  description?: string | undefined;
  /** Absolute canonical URL; omitted on the 404 page. */
  canonical?: string | undefined;
  /** Omitted on the 404 page (its status already keeps it out of the index). */
  robots?: string | undefined;
  /** hreflang → absolute URL, including x-default. */
  hreflang: Record<string, string>;
  ogType: 'website' | 'article';
  ogImage: string;
  ogImageAlt?: string | undefined;
  published?: string | undefined;
  modified?: string | undefined;
  /** Path of the Markdown copy, when the page has one. */
  markdown?: string | undefined;
}

/** Robots for every indexable page, as on the legacy site; noindex pages add `noindex`. */
export const robotsFor = (noindex: boolean): string =>
  noindex ? 'noindex, max-image-preview:large' : 'max-image-preview:large';

async function ogImageFor(rec: Rec): Promise<string> {
  let src = defaultOg;
  if (rec.data.cover) {
    const img = await resolveImage(rec.dir, rec.data.cover);
    if (isOptimizable(img)) src = img;
  }
  const out = await getImage({ src, width: Math.min(1200, src.width), format: 'jpg', quality: 80 });
  return absoluteUrl(out.src);
}

/** Records that get a Markdown copy at `<url>.md` (all except home pages). */
export const markdownPath = (rec: Rec): string | undefined =>
  rec.data.type === 'page' && rec.data.path === '/' ? undefined : `${rec.url}.md`;

export async function headFor(rec: Rec): Promise<HeadData> {
  const translations = await translationsOf(rec);
  const hreflang: Record<string, string> = {};
  const en = translations.find((r) => r.lang === 'en');
  if (en) hreflang['x-default'] = absoluteUrl(en.url);
  for (const r of translations) hreflang[r.lang] = absoluteUrl(r.url);
  const { data } = rec;
  return {
    lang: rec.lang,
    title: data.seoTitle ?? data.title,
    description: data.description,
    canonical: absoluteUrl(rec.url),
    robots: robotsFor(data.noindex),
    hreflang,
    ogType: data.type === 'guide' ? 'article' : 'website',
    ogImage: await ogImageFor(rec),
    ogImageAlt: data.coverAlt ?? data.title,
    published: data.type === 'guide' ? data.created : undefined,
    modified: data.type === 'guide' ? data.updated : undefined,
    markdown: markdownPath(rec),
  };
}

/** Language switcher targets: this record's translations. */
export async function alternatesFor(rec: Rec): Promise<Partial<Record<Lang, string>>> {
  return Object.fromEntries((await translationsOf(rec)).map((r) => [r.lang, r.url]));
}
