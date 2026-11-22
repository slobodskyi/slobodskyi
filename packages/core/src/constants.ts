export const SITE = 'https://slobodskyi.com';

export const LANGS = ['en', 'uk', 'ru'] as const;
export type Lang = (typeof LANGS)[number];

/** URL prefix per language. Ukrainian lives under /ua (legacy path), hreflang stays "uk". */
export const LANG_PREFIX: Record<Lang, string> = { en: '', uk: '/ua', ru: '/ru' };

export const HUBS = ['create', 'connect', 'monetize', 'grow'] as const;
export type Hub = (typeof HUBS)[number];

/** Collection = folder under content/. Each collection allows a fixed set of record types. */
export const COLLECTIONS = {
  guides: ['guide'],
  essays: ['essay'],
  log: ['log'],
  til: ['til'],
  links: ['links'],
  notes: ['note'],
  projects: ['project'],
  pages: ['page', 'now'],
  hubs: ['hub'],
  categories: ['category'],
} as const;

export type Collection = keyof typeof COLLECTIONS;
export type RecordType = (typeof COLLECTIONS)[Collection][number];
export const COLLECTION_NAMES = Object.keys(COLLECTIONS) as Collection[];

/** The only collection where `visibility: private` is allowed. */
export const PRIVATE_COLLECTION: Collection = 'notes';

export const isCollection = (value: string): value is Collection => value in COLLECTIONS;
export const isLang = (value: string): value is Lang => (LANGS as readonly string[]).includes(value);
