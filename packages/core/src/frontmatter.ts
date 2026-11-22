import { parse, stringify } from 'yaml';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export interface ParsedDocument {
  data: unknown;
  body: string;
}

/**
 * Splits a Markdown/MDX file into YAML frontmatter and body. YAML 1.2 core schema: dates stay
 * strings. Throws on a missing frontmatter block or invalid YAML.
 */
export function parseDocument(raw: string): ParsedDocument {
  const match = FRONTMATTER.exec(raw);
  if (!match) throw new Error('missing frontmatter block (--- … ---) at the top of the file');
  return { data: parse(match[1] ?? '') ?? {}, body: raw.slice(match[0].length) };
}

export function serializeDocument(data: Record<string, unknown>, body: string): string {
  const yaml = stringify(data, { lineWidth: 0 });
  return `---\n${yaml}---\n${body.startsWith('\n') ? '' : '\n'}${body}`;
}
