// JSON-LD builders. One Person and one Organization with stable @ids, referenced from every page.
import { SITE, type Lang } from '@slobodskyi/core';

export const PERSON_ID = `${SITE}/#person`;
export const ORG_ID = `${SITE}/#organization`;
export const WEBSITE_ID = `${SITE}/#website`;

/** Unified profile list (the legacy Organization and ProfilePage blocks differed). */
export const SAME_AS = [
  'https://www.youtube.com/@slobodskyi',
  'https://www.instagram.com/slobodskyi',
  'https://www.threads.com/@slobodskyi',
  'https://www.patreon.com/slobodskyi',
  'https://x.com/slobodskyi',
  'https://www.tiktok.com/@slobodskyi.com',
  'https://www.pinterest.com/slobodskyi',
];

export interface Crumb {
  name: string;
  url: string; // absolute
}

type Node = Record<string, unknown>;

export function siteGraph(opts: { logo: string; authorImage: string }): Node[] {
  return [
    {
      '@type': 'Person',
      '@id': PERSON_ID,
      name: 'Oleksandr Slobodskyi',
      alternateName: 'slobodskyi',
      url: `${SITE}/about`,
      image: opts.authorImage,
      jobTitle: 'Creator economy consultant',
      sameAs: SAME_AS,
    },
    {
      '@type': 'Organization',
      '@id': ORG_ID,
      name: 'Oleksandr Slobodskyi',
      alternateName: 'slobodskyi',
      url: SITE,
      logo: { '@type': 'ImageObject', url: opts.logo },
      founder: { '@id': PERSON_ID },
      sameAs: SAME_AS,
      contactPoint: [
        {
          '@type': 'ContactPoint',
          contactType: 'customer service',
          email: 'oleksandr@slobodskyi.com',
          availableLanguage: ['en', 'uk', 'ru'],
        },
      ],
    },
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: 'Oleksandr Slobodskyi',
      url: SITE,
      inLanguage: ['en', 'uk', 'ru'],
      publisher: { '@id': ORG_ID },
    },
  ];
}

export function breadcrumbList(crumbs: Crumb[]): Node {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

export function itemList(items: { name: string; url: string }[]): Node {
  return {
    '@type': 'ItemList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: it.url,
    })),
  };
}

/** Calendar date → ISO 8601 date-time (midnight UTC). */
export const isoDateTime = (date: string): string => `${date}T00:00:00Z`;

export function blogPosting(opts: {
  url: string;
  lang: Lang;
  headline: string;
  description?: string | undefined;
  image?: string | undefined;
  created: string;
  updated: string;
  section: string;
  minutes: number;
}): Node {
  return {
    '@type': 'BlogPosting',
    '@id': `${opts.url}#article`,
    headline: opts.headline,
    description: opts.description,
    image: opts.image,
    datePublished: isoDateTime(opts.created),
    dateModified: isoDateTime(opts.updated),
    author: { '@id': PERSON_ID },
    publisher: { '@id': ORG_ID },
    articleSection: opts.section,
    timeRequired: `PT${opts.minutes}M`,
    inLanguage: opts.lang,
    mainEntityOfPage: { '@type': 'WebPage', '@id': opts.url },
    isPartOf: { '@id': WEBSITE_ID },
  };
}

export function faqPage(items: { q: string; a: string }[]): Node {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function profilePage(opts: { url: string; created: string; updated: string }): Node {
  return {
    '@type': 'ProfilePage',
    '@id': opts.url,
    url: opts.url,
    dateCreated: isoDateTime(opts.created),
    dateModified: isoDateTime(opts.updated),
    mainEntity: { '@id': PERSON_ID },
  };
}

/** Serialises a @graph; `<` is escaped so content can never close the script tag. */
export const jsonLd = (nodes: Node[]): string =>
  JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
