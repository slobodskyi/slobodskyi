import { COLLECTIONS } from '../constants.ts';
import { parseDocument } from '../frontmatter.ts';
import { frontmatterSchema, type Frontmatter } from '../schema.ts';
import { addressOf, refFromPath, type ContentSource, type RecordRef } from '../source.ts';
import { urlFor } from '../url.ts';

export interface Problem {
  level: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
  address?: string;
}

export interface LoadedRecord {
  ref: RecordRef;
  path: string;
  address: string;
  raw: string;
  data: Frontmatter;
  body: string;
  url: string;
}

export interface LoadResult {
  records: LoadedRecord[];
  problems: Problem[];
}

/** Reads, parses and schema-checks every file of the source. Invalid files become problems. */
export async function loadRecords(source: ContentSource): Promise<LoadResult> {
  const paths = await source.list();
  const problems: Problem[] = [];
  const loaded = await Promise.all(
    paths.map(async (path): Promise<LoadedRecord | null> => {
      const refResult = refFromPath(path);
      if (!refResult.ok) {
        problems.push({ level: 'error', code: 'layout', message: refResult.message, path });
        return null;
      }
      const ref = refResult.ref;
      const address = addressOf(ref);
      const at = { path, address };
      const raw = await source.read(path);

      let doc;
      try {
        doc = parseDocument(raw);
      } catch (e) {
        problems.push({ level: 'error', code: 'frontmatter', message: (e as Error).message, ...at });
        return null;
      }

      const parsed = frontmatterSchema.safeParse(doc.data);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = issue.path.join('.') || '(frontmatter)';
          problems.push({ level: 'error', code: 'schema', message: `${field}: ${issue.message}`, ...at });
        }
        return null;
      }

      const data = parsed.data;
      const allowed: readonly string[] = COLLECTIONS[ref.collection];
      if (!allowed.includes(data.type)) {
        problems.push({
          level: 'error',
          code: 'type',
          message: `type "${data.type}" is not allowed in ${ref.collection}/ (allowed: ${allowed.join(', ')})`,
          ...at,
        });
        return null;
      }

      return { ref, path, address, raw, data, body: doc.body, url: urlFor(ref.lang, ref.collection, data) };
    }),
  );
  const records = loaded.filter((r): r is LoadedRecord => r !== null);
  return { records, problems };
}
