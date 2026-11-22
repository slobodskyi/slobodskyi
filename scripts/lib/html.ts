// Minimal DOM helpers over parse5. parse5's serializer follows the HTML spec, so `innerHtml()` is
// identical to what a browser returns for element.innerHTML — needed to reproduce legacy anchors.
import { parse, serialize } from 'parse5';

export type Node = {
  nodeName: string;
  tagName?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: Node[];
  content?: Node;
  value?: string;
};

export const parseHtml = (html: string): Node => parse(html) as unknown as Node;

export const innerHtml = (node: Node): string => serialize(node as never);

export const attr = (node: Node, name: string): string | undefined =>
  node.attrs?.find((a) => a.name === name)?.value;

/** Depth-first walk in document order. Return false from `visit` to skip a subtree. */
export function walk(node: Node, visit: (n: Node) => boolean | void): void {
  if (visit(node) === false) return;
  for (const child of node.childNodes ?? []) walk(child, visit);
}

export function findAll(root: Node, predicate: (n: Node) => boolean): Node[] {
  const found: Node[] = [];
  walk(root, (n) => {
    if (predicate(n)) found.push(n);
  });
  return found;
}

export const byTag = (root: Node, tag: string): Node[] => findAll(root, (n) => n.tagName === tag);

export const byId = (root: Node, id: string): Node | undefined =>
  findAll(root, (n) => attr(n, 'id') === id)[0];

const SKIP_TEXT = new Set(['script', 'style', 'noscript', 'template']);

/** Text content with whitespace collapsed (like innerText, roughly). */
export function textOf(node: Node): string {
  const parts: string[] = [];
  walk(node, (n) => {
    if (n.tagName && SKIP_TEXT.has(n.tagName)) return false;
    if (n.nodeName === '#text' && n.value) parts.push(n.value);
  });
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/** Raw text of a <script> (its single text child). */
export const rawText = (node: Node): string => (node.childNodes ?? []).map((c) => c.value ?? '').join('');

export const meta = (root: Node, key: 'name' | 'property', value: string): string | undefined =>
  findAll(root, (n) => n.tagName === 'meta' && attr(n, key)?.toLowerCase() === value).map((n) =>
    attr(n, 'content'),
  )[0];
