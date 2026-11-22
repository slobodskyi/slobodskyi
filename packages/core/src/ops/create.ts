import {
  COLLECTIONS,
  PRIVATE_COLLECTION,
  type Collection,
  type Lang,
  type RecordType,
} from '../constants.ts';
import { serializeDocument } from '../frontmatter.ts';
import { frontmatterSchema, type Frontmatter } from '../schema.ts';
import { addressOf, isValidId, pathOf, type ContentSource, type RecordRef } from '../source.ts';
import { urlFor } from '../url.ts';
import { loadRecords, type Problem } from './load.ts';

export interface CreateInput {
  collection: Collection;
  id: string;
  lang: Lang;
  /** Defaults to the first type allowed in the collection. */
  type?: RecordType;
  ext?: 'md' | 'mdx';
  /** Frontmatter fields (title, description, hub, …). */
  fields: Record<string, unknown>;
  body?: string;
}

export type CreateResult =
  | { ok: true; address: string; path: string; url: string; data: Frontmatter }
  | { ok: false; problems: Problem[] };

/** Fields copied from an existing language version when creating a translation. */
const INHERITED = ['hub', 'category', 'slug', 'path', 'stage', 'related'] as const;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Creates a new record file. Never overwrites. A translation (same id, new lang) inherits
 * hub/category/slug/path from the existing version unless given. Defaults: status draft,
 * visibility public (private in notes/), created = updated = today.
 */
export async function create(
  source: ContentSource,
  input: CreateInput,
  options: { today?: string } = {},
): Promise<CreateResult> {
  const fail = (code: string, message: string): CreateResult => ({
    ok: false,
    problems: [{ level: 'error', code, message, address: addressOf(input) }],
  });

  const allowed: readonly string[] = COLLECTIONS[input.collection];
  if (!allowed) return fail('collection', `unknown collection ${input.collection}`);
  if (!isValidId(input.id)) return fail('id', `invalid id "${input.id}": lowercase latin, digits, hyphens`);
  const type = input.type ?? allowed[0];
  if (!type || !allowed.includes(type))
    return fail('type', `type ${type} is not allowed in ${input.collection}/`);

  const ref: RecordRef = {
    collection: input.collection,
    id: input.id,
    lang: input.lang,
    ext: input.ext ?? 'mdx',
  };
  const path = pathOf(ref);
  const otherExt = pathOf({ ...ref, ext: ref.ext === 'md' ? 'mdx' : 'md' });
  if ((await source.exists(path)) || (await source.exists(otherExt))) {
    return fail('exists', `${addressOf(ref)} already exists`);
  }

  const { records } = await loadRecords(source);
  const sibling = records.find((r) => r.ref.collection === ref.collection && r.ref.id === ref.id);
  const inherited: Record<string, unknown> = {};
  if (sibling) {
    for (const key of INHERITED) {
      const value = (sibling.data as Record<string, unknown>)[key];
      if (value !== undefined) inherited[key] = value;
    }
  }

  const date = options.today ?? today();
  const candidate = {
    type,
    status: 'draft',
    visibility: ref.collection === PRIVATE_COLLECTION ? 'private' : 'public',
    created: date,
    updated: date,
    ...inherited,
    ...input.fields,
  };

  const parsed = frontmatterSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((i) => ({
        level: 'error' as const,
        code: 'schema',
        message: `${i.path.join('.') || '(frontmatter)'}: ${i.message}`,
        address: addressOf(ref),
        path,
      })),
    };
  }

  const url = urlFor(ref.lang, ref.collection, parsed.data);
  const clash = records.find((r) => r.url === url && r.data.status !== 'archived');
  if (clash) return fail('url-conflict', `URL ${url} is already used by ${clash.address}`);

  await source.write(path, serializeDocument(parsed.data as Record<string, unknown>, input.body ?? ''));
  return { ok: true, address: addressOf(ref), path, url, data: parsed.data };
}
