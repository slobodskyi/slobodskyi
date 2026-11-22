import { COLLECTIONS, isCollection, isLang, type Collection, type Lang } from './constants.ts';

/**
 * Storage-agnostic access to content files. Paths are relative to the content root and use "/".
 * Implementations: FsSource (local files, `@slobodskyi/core/fs`), MemorySource (tests);
 * later GitHubSource (GitHub API) and IndexSource (content.json in R2) for Workers.
 */
export interface ContentSource {
  /** All .md/.mdx files under the content root, excluding inbox/. Sorted. */
  list(): Promise<string[]>;
  read(path: string): Promise<string>;
  write(path: string, raw: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export interface RecordRef {
  collection: Collection;
  id: string;
  lang: Lang;
  ext: 'md' | 'mdx';
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATH = /^([^/]+)\/([^/]+)\/([^/]+)\.(md|mdx)$/;

/** Record address: "<collection>/<id>:<lang>". Section address appends "#<anchor>". */
export const addressOf = (ref: Pick<RecordRef, 'collection' | 'id' | 'lang'>): string =>
  `${ref.collection}/${ref.id}:${ref.lang}`;

export const pathOf = (ref: RecordRef): string => `${ref.collection}/${ref.id}/${ref.lang}.${ref.ext}`;

export type RefResult = { ok: true; ref: RecordRef } | { ok: false; message: string };

/** Parses "guides/payoneer/en.mdx" into a RecordRef, explaining what is wrong otherwise. */
export function refFromPath(path: string): RefResult {
  const m = PATH.exec(path);
  if (!m) return { ok: false, message: 'expected <collection>/<id>/<lang>.(md|mdx)' };
  const [, collection = '', id = '', lang = '', ext] = m;
  if (!isCollection(collection)) {
    return {
      ok: false,
      message: `unknown collection "${collection}" (${Object.keys(COLLECTIONS).join(', ')})`,
    };
  }
  if (!ID.test(id)) return { ok: false, message: `invalid id "${id}": lowercase latin, digits, hyphens` };
  if (!isLang(lang)) return { ok: false, message: `unknown language "${lang}" (en, uk, ru)` };
  return { ok: true, ref: { collection, id, lang, ext: ext === 'md' ? 'md' : 'mdx' } };
}

export const isValidId = (id: string): boolean => ID.test(id);

/** In-memory source for tests and dry runs. */
export class MemorySource implements ContentSource {
  readonly files: Map<string, string>;

  constructor(files: Record<string, string> = {}) {
    this.files = new Map(Object.entries(files));
  }

  async list(): Promise<string[]> {
    return [...this.files.keys()].filter((p) => /\.mdx?$/.test(p) && !p.startsWith('inbox/')).sort();
  }

  async read(path: string): Promise<string> {
    const raw = this.files.get(path);
    if (raw === undefined) throw new Error(`not found: ${path}`);
    return raw;
  }

  async write(path: string, raw: string): Promise<void> {
    this.files.set(path, raw);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
}
