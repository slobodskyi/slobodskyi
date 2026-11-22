import { createAnchorer } from './anchor.ts';
import { internalPath } from './url.ts';

export interface Heading {
  depth: number;
  text: string;
  anchor: string;
  /**
   * True for a JSX heading with an explicit id, `<h2 id="anchor">Text</h2>` on its own line.
   * Used only to preserve legacy anchors. (`{#id}` is not an option: in MDX braces are JS.)
   */
  explicit: boolean;
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const JSX_HEADING = /^\s*<h([1-6])\s+id=["']([^"']+)["'][^>]*>(.*?)<\/h\1>\s*$/i;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#x27': "'",
};

/** Lines of the body outside fenced code blocks. */
function proseLines(body: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of body.split(/\r?\n/)) {
    const m = FENCE.exec(line);
    if (m) {
      const marker = m[1] ?? '';
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence === null) out.push(line);
  }
  return out;
}

/** Plain text of inline Markdown, close to what ends up in the rendered heading. */
export function inlineText(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/&(#?\w+);/g, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all)
    .trim();
}

/**
 * Headings outside code blocks, in document order: Markdown ATX headings (anchor = github-slugger
 * slug, exactly as Astro injects it) and JSX headings with an explicit id. Like Astro, explicit
 * ids do not advance the slugger. This is the single source of heading anchors for the TOC,
 * content.json and section addresses. Setext headings are not used in this repository.
 */
export function extractHeadings(body: string): Heading[] {
  const anchorFor = createAnchorer();
  const headings: Heading[] = [];
  for (const line of proseLines(body)) {
    const jsx = JSX_HEADING.exec(line);
    if (jsx) {
      const text = inlineText(jsx[3] ?? '');
      headings.push({ depth: Number(jsx[1]), text, anchor: jsx[2] ?? '', explicit: true });
      continue;
    }
    const m = HEADING.exec(line);
    if (!m) continue;
    const text = inlineText(m[2] ?? '');
    headings.push({ depth: (m[1] ?? '').length, text, anchor: anchorFor(text), explicit: false });
  }
  return headings;
}

/** Unique internal link targets (normalised paths) found in Markdown links and href attributes. */
export function extractInternalLinks(body: string): string[] {
  const found = new Set<string>();
  const text = proseLines(body).join('\n');
  const patterns = [/\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g, /\bhref\s*=\s*["']([^"']+)["']/g];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const path = internalPath(m[1] ?? '');
      if (path) found.add(path);
    }
  }
  return [...found].sort();
}
