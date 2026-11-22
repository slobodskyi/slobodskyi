import type { Collection, Lang, RecordType } from '../constants.ts';
import { extractHeadings, extractInternalLinks, type Heading } from '../markdown.ts';
import { isPublished } from '../schema.ts';
import type { ContentSource } from '../source.ts';
import { loadRecords, type Problem } from './load.ts';

export interface IndexEntry {
  address: string;
  collection: Collection;
  id: string;
  lang: Lang;
  type: RecordType;
  url: string;
  /** sha256 of the raw file: changes whenever frontmatter or body changes. */
  hash: string;
  headings: Omit<Heading, 'explicit'>[];
  /** Internal link targets (normalised paths). */
  links: string[];
}

export interface ContentIndex {
  version: 1;
  entries: IndexEntry[];
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds content.json: one entry per published public record, sorted by address. Deterministic
 * (no timestamps), so the same content always yields the same file. Minimal on purpose (Stage 1):
 * only what the checks need.
 */
export async function buildIndex(
  source: ContentSource,
  options: { includeUnpublished?: boolean } = {},
): Promise<{ index: ContentIndex; problems: Problem[] }> {
  const { records, problems } = await loadRecords(source);
  const selected = records.filter(
    (r) => r.data.visibility !== 'private' && (options.includeUnpublished || isPublished(r.data)),
  );
  const entries = await Promise.all(
    selected.map(async (r): Promise<IndexEntry> => ({
      address: r.address,
      collection: r.ref.collection,
      id: r.ref.id,
      lang: r.ref.lang,
      type: r.data.type,
      url: r.url,
      hash: await sha256(r.raw),
      headings: extractHeadings(r.body).map(({ depth, text, anchor }) => ({ depth, text, anchor })),
      links: extractInternalLinks(r.body),
    })),
  );
  entries.sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
  return { index: { version: 1, entries }, problems };
}
