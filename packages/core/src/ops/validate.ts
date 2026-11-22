import { PRIVATE_COLLECTION } from '../constants.ts';
import { extractHeadings } from '../markdown.ts';
import { isPublished } from '../schema.ts';
import type { ContentSource } from '../source.ts';
import { loadRecords, type LoadedRecord, type Problem } from './load.ts';

export interface ValidateResult {
  ok: boolean;
  records: number;
  published: number;
  errors: Problem[];
  warnings: Problem[];
}

/** Fields that must be identical across language versions of one record. */
const SHARED_FIELDS = ['type', 'hub', 'category'] as const;

/** Full content check: per-file schema plus cross-record rules. Never writes. */
export async function validate(source: ContentSource): Promise<ValidateResult> {
  const { records, problems } = await loadRecords(source);
  const add = (r: LoadedRecord, level: Problem['level'], code: string, message: string) =>
    problems.push({ level, code, message, path: r.path, address: r.address });

  const byKey = new Map<string, LoadedRecord[]>();
  for (const r of records) {
    const key = `${r.ref.collection}/${r.ref.id}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }

  const liveUrls = new Map<string, LoadedRecord>();
  const legacyOwners = new Map<string, LoadedRecord>();

  for (const r of records) {
    const d = r.data;

    // Language versions of one id must not differ in .md/.mdx and must exist once.
    const siblings = byKey.get(`${r.ref.collection}/${r.ref.id}`) ?? [];
    if (siblings.filter((s) => s.ref.lang === r.ref.lang).length > 1) {
      add(r, 'error', 'duplicate-lang', `both .md and .mdx exist for ${r.address}`);
    }

    if (d.visibility === 'private' && r.ref.collection !== PRIVATE_COLLECTION) {
      add(r, 'error', 'private', `visibility: private is allowed only in ${PRIVATE_COLLECTION}/`);
    }
    if (d.updated < d.created)
      add(r, 'error', 'dates', `updated (${d.updated}) is before created (${d.created})`);
    if (d.status === 'scheduled' && !d.publishAt)
      add(r, 'error', 'schedule', 'status scheduled needs publishAt');
    if (isPublished(d) && !d.description)
      add(r, 'error', 'description', 'published record needs a description');

    // URL uniqueness among everything that is not archived.
    if (d.status !== 'archived') {
      const other = liveUrls.get(r.url);
      if (other) add(r, 'error', 'url-conflict', `URL ${r.url} is also used by ${other.address}`);
      else liveUrls.set(r.url, r);
    }

    for (const legacy of d.legacyUrls) {
      const owner = legacyOwners.get(legacy);
      if (owner && owner !== r)
        add(r, 'error', 'legacy-conflict', `legacy URL ${legacy} also claimed by ${owner.address}`);
      else legacyOwners.set(legacy, r);
      if (legacy === r.url) add(r, 'error', 'legacy-self', `legacy URL ${legacy} equals the current URL`);
    }

    for (const key of SHARED_FIELDS) {
      const mine = (d as Record<string, unknown>)[key];
      const mismatch = siblings.find((s) => (s.data as Record<string, unknown>)[key] !== mine);
      if (mismatch) {
        add(r, 'error', 'translation-mismatch', `${key} differs from ${mismatch.address}`);
      }
    }

    for (const rel of d.related) {
      if (!byKey.has(rel)) add(r, 'error', 'related', `related record ${rel} does not exist`);
    }

    if (d.type === 'guide') {
      const cats = [...records].filter(
        (c) => c.data.type === 'category' && c.data.category === d.category && c.ref.lang === r.ref.lang,
      );
      if (cats.length === 0) {
        add(r, 'error', 'category', `no category record ${d.hub}/${d.category} in ${r.ref.lang}`);
      } else if (cats[0] && cats[0].data.type === 'category' && cats[0].data.hub !== d.hub) {
        add(
          r,
          'error',
          'category',
          `category ${d.category} belongs to hub ${cats[0].data.hub}, not ${d.hub}`,
        );
      }
    }

    // Explicit ids bypass the slugger, so they can collide with automatic ones.
    const anchors = new Set<string>();
    for (const h of extractHeadings(r.body)) {
      if (anchors.has(h.anchor)) add(r, 'error', 'anchor', `duplicate heading anchor #${h.anchor}`);
      anchors.add(h.anchor);
    }
  }

  // A legacy URL that is a live page would shadow that page (redirects run before assets).
  for (const [legacy, owner] of legacyOwners) {
    const live = liveUrls.get(legacy);
    if (live && live !== owner) {
      add(owner, 'error', 'legacy-live', `legacy URL ${legacy} is the live URL of ${live.address}`);
    }
  }

  const errors = problems.filter((p) => p.level === 'error');
  return {
    ok: errors.length === 0,
    records: records.length,
    published: records.filter((r) => isPublished(r.data)).length,
    errors,
    warnings: problems.filter((p) => p.level === 'warning'),
  };
}
