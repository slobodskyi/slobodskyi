// Card data for lists of hubs, categories and guides.
import type { CardItem } from '../components/Cards.astro';
import { categoriesOf, guidesOf, labelOf, readingTime, type Rec } from './content';
import { formatDate, t } from './i18n';

const cover = (rec: Rec) =>
  rec.data.cover
    ? { dir: rec.dir, src: rec.data.cover, alt: rec.data.coverAlt ?? rec.data.title }
    : undefined;

export async function guideCard(rec: Rec): Promise<CardItem> {
  const s = t(rec.lang);
  return {
    url: rec.url,
    title: rec.data.title,
    text: rec.data.lead ?? rec.data.description,
    cover: cover(rec),
    chips: [s.minutes(readingTime(rec)), formatDate(rec.data.updated, rec.lang)],
  };
}

export async function hubCard(rec: Rec): Promise<CardItem> {
  if (rec.data.type !== 'hub') throw new Error('hubCard expects a hub');
  const count = (await guidesOf(rec.lang, rec.data.hub)).length;
  return {
    url: rec.url,
    title: labelOf(rec),
    text: rec.data.description,
    cover: cover(rec),
    chips: [t(rec.lang).articles(count)],
  };
}

export async function categoryCard(rec: Rec): Promise<CardItem> {
  if (rec.data.type !== 'category') throw new Error('categoryCard expects a category');
  const count = (await guidesOf(rec.lang, rec.data.hub, rec.data.category)).length;
  return {
    url: rec.url,
    title: labelOf(rec),
    text: rec.data.description,
    cover: cover(rec),
    chips: [t(rec.lang).articles(count)],
  };
}

/** Categories of a hub that have at least one guide. */
export async function hubCategoryCards(rec: Rec): Promise<CardItem[]> {
  if (rec.data.type !== 'hub') return [];
  const { hub } = rec.data;
  const cats = await categoriesOf(rec.lang, hub);
  const withGuides = [];
  for (const c of cats)
    if (c.data.type === 'category' && (await guidesOf(rec.lang, hub, c.data.category)).length)
      withGuides.push(c);
  return Promise.all(withGuides.map(categoryCard));
}
