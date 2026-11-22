// Webflow rich text (HTML) → MDX. hast → mdast with custom handlers, then mdast-util-to-markdown
// with the MDX and GFM extensions, so `{`, `<` and friends are escaped the way MDX needs.
//
// Mapping (see data/convert-report.md for what is left over):
//   figure > img                → <Shot src alt [wide] />  (image copied next to the record)
//   figure/div > iframe YouTube → <YouTube id />
//   embed: table                → GFM table (caption → paragraph above it)
//   embed: data-slobodskyi-quiz → <Quiz id theme />
//   embed: Buy Me a Coffee      → <BuyMeACoffee … />  (click-to-load facade later)
//   iframe VideoAsk             → <VideoAsk id />      (click-to-load facade later)
//   embed: other scripts/styles → dropped, reported
//   blockquote                  → <Callout> (a real quotation with attribution stays `>`)
//   h2 whose legacy Webflow id differs from github-slugger → <h2 id="legacy">…</h2>
import { legacyAnchor, extractHeadings } from '@slobodskyi/core';
import type { Element, ElementContent, Root as HastRoot, Text as HastText } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import { toMdast, type Handle, type State } from 'hast-util-to-mdast';
import { toText } from 'hast-util-to-text';
import type { BlockContent, Nodes, PhrasingContent, Root, RootContent } from 'mdast';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { mdxToMarkdown } from 'mdast-util-mdx';
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import { toMarkdown } from 'mdast-util-to-markdown';
import { visit } from 'unist-util-visit';
import { byTag, innerHtml, parseHtml } from '../lib/html.ts';

export interface ConvertContext {
  /** Copies a Webflow CDN file next to the record and returns its file name, or null if unknown. */
  asset(url: string): string | null;
  /** Rewrites a link target (internal links to site paths, CDN files to local copies). */
  link(href: string): string;
  /** Records something that was not converted automatically. */
  issue(kind: string, detail: string): void;
}

const ZWJ = /‍/g;

const cls = (el: Element): string[] => {
  const c = el.properties?.className;
  return Array.isArray(c) ? c.map(String) : [];
};
const prop = (el: Element, name: string): string | undefined => {
  const v = el.properties?.[name];
  return v === undefined || v === null ? undefined : Array.isArray(v) ? v.join(' ') : String(v);
};
const elements = (el: Element | HastRoot, tag?: string): Element[] => {
  const out: Element[] = [];
  const rec = (n: Element | HastRoot) => {
    for (const c of n.children) {
      if (c.type !== 'element') continue;
      if (!tag || c.tagName === tag) out.push(c);
      rec(c);
    }
  };
  rec(el);
  return out;
};

const attr = (name: string, value: string | boolean | undefined): MdxJsxAttribute[] =>
  value === undefined || value === false || value === ''
    ? []
    : [{ type: 'mdxJsxAttribute', name, value: value === true ? null : value }];

const jsx = (name: string, attributes: MdxJsxAttribute[], children: BlockContent[] = []) =>
  ({ type: 'mdxJsxFlowElement', name, attributes, children }) as MdxJsxFlowElement;

export function youtubeId(src: string): string | null {
  const m = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{11})/.exec(src);
  return m?.[1] ?? null;
}

function iframeNode(el: Element, ctx: ConvertContext): MdxJsxFlowElement | undefined {
  const src = prop(el, 'src') ?? '';
  const id = youtubeId(src);
  if (id) return jsx('YouTube', attr('id', id));
  const videoask = /videoask\.com\/([\w-]+)/.exec(src)?.[1];
  if (videoask) return jsx('VideoAsk', attr('id', videoask));
  ctx.issue('iframe', `unknown iframe dropped: ${src}`);
  return undefined;
}

function handlers(ctx: ConvertContext): Record<string, Handle> {
  const figure: Handle = (state, node) => {
    const img = elements(node, 'img')[0];
    const iframe = elements(node, 'iframe')[0];
    const caption = elements(node, 'figcaption').find((c) => toText(c).trim());
    if (caption) ctx.issue('caption', `figure caption dropped: ${toText(caption)}`);

    if (iframe) return iframeNode(iframe, ctx);
    if (!img) return state.toFlow(state.all(node));
    const src = prop(img, 'src') ?? '';
    const file = ctx.asset(src);
    if (!file) {
      ctx.issue('image', `image not in media map, dropped: ${src}`);
      return undefined;
    }
    if (elements(node, 'a').length) ctx.issue('image-link', `link around image dropped: ${src}`);
    const wide = cls(node).includes('w-richtext-align-fullwidth');
    return jsx('Shot', [
      ...attr('src', `./${file}`),
      ...attr('alt', prop(img, 'alt') ?? ''),
      ...attr('wide', wide),
    ]);
  };

  const div: Handle = (state, node) => {
    const quiz = elements(node).find((e) => prop(e, 'dataSlobodskyiQuiz'));
    if (quiz) {
      return jsx('Quiz', [
        ...attr('id', prop(quiz, 'dataSlobodskyiQuiz')),
        ...attr('theme', prop(quiz, 'dataSlobodskyiQuizTheme')),
      ]);
    }
    const table = elements(node, 'table')[0];
    if (table) {
      const out: RootContent[] = [];
      const caption = elements(table, 'caption')[0];
      if (caption)
        out.push({
          type: 'paragraph',
          children: [{ type: 'strong', children: state.all(caption) as PhrasingContent[] }],
        });
      if (
        elements(table, 'td').some((td) => cls(td).length) ||
        elements(table, 'th').some((th) => cls(th).length)
      ) {
        ctx.issue('table-style', 'table cell classes (e.g. highlight) dropped');
      }
      out.push(...(state.all({ type: 'root', children: [table] } as never) as RootContent[]));
      return out as never;
    }
    const iframe = elements(node, 'iframe')[0];
    if (iframe && !elements(node, 'p').length) return iframeNode(iframe, ctx);
    for (const s of elements(node, 'script')) {
      const src = prop(s, 'src') ?? '';
      if (src.includes('buymeacoffee')) {
        return jsx('BuyMeACoffee', [
          ...attr('slug', prop(s, 'dataSlug')),
          ...attr('text', prop(s, 'dataText')),
          ...attr('emoji', prop(s, 'dataEmoji')),
          ...attr('color', prop(s, 'dataColor')),
        ]);
      }
      const code = toText(s);
      if (code.includes('FAQPage')) continue; // FAQ JSON-LD generator: replaced by frontmatter `faq`
      ctx.issue('script', `script dropped: ${src || code.replace(/\s+/g, ' ').slice(0, 80)}`);
    }
    return state.toFlow(state.all(node));
  };

  const blockquote: Handle = (state, node) => {
    const children = state.toFlow(state.all(node)) as BlockContent[];
    const text = toText(node).trim();
    // A quotation with attribution keeps Markdown blockquote semantics.
    if (/^[«“"„]/.test(text) && /[—–-]\s*\S[^.!?]*$/.test(text)) {
      return { type: 'blockquote', children };
    }
    return jsx('Callout', [], children);
  };

  return {
    figure,
    div,
    blockquote,
    iframe: (_state: State, node: Element) => iframeNode(node, ctx),
  } as Record<string, Handle>;
}

function cleanHast(tree: HastRoot): void {
  const rec = (n: HastRoot | Element) => {
    n.children = n.children.filter(
      (c: ElementContent | HastRoot['children'][number]) => c.type !== 'comment',
    );
    for (const c of n.children) {
      if (c.type === 'text') (c as HastText).value = (c as HastText).value.replace(ZWJ, '');
      else if (c.type === 'element') rec(c);
    }
  };
  rec(tree);
}

function postMdast(tree: Root, ctx: ConvertContext): void {
  visit(tree, (node: Nodes) => {
    if (node.type === 'link') node.url = ctx.link(node.url);
    if (node.type === 'image') {
      if (/facebook\.com\/tr\b/.test(node.url)) {
        node.url = ''; // tracking pixel from <noscript>, removed below
        return;
      }
      const file = ctx.asset(node.url);
      if (file) node.url = `./${file}`;
      else ctx.issue('image', `inline image not in media map: ${node.url}`);
    }
  });
  visit(tree, 'image', (img, i, parent) => {
    if (img.url || !parent || i === undefined) return undefined;
    parent.children.splice(i, 1);
    return i;
  });
  // Links without visible content (e.g. a background video wrapped in <a>) carry nothing.
  visit(tree, 'link', (link, i, parent) => {
    const empty = link.children.every((c) => c.type === 'text' && !c.value.trim());
    if (!empty || !parent || i === undefined) return undefined;
    ctx.issue('empty-link', `link without content dropped: ${link.url}`);
    parent.children.splice(i, 1);
    return i;
  });
  // Breaks inside table cells would end the row: use <br /> there.
  visit(tree, 'tableCell', (cell) => {
    visit(cell, 'break', (_n, i, parent) => {
      if (parent && i !== undefined)
        parent.children[i] = { type: 'mdxJsxTextElement', name: 'br', attributes: [], children: [] } as never;
    });
  });
  // Drop empty paragraphs (Webflow leaves "‍" spacers).
  visit(tree, 'paragraph', (p, i, parent) => {
    const empty = p.children.every((c) => (c.type === 'text' && !c.value.trim()) || c.type === 'break');
    if (empty && parent && i !== undefined) {
      parent.children.splice(i, 1);
      return i;
    }
    return undefined;
  });
}

const stringify = (tree: Root): string =>
  toMarkdown(tree, {
    extensions: [mdxToMarkdown(), gfmToMarkdown()],
    bullet: '-',
    emphasis: '_',
    strong: '*',
    rule: '-',
    listItemIndent: 'one',
    fences: true,
  });

/** Ids the legacy Webflow script gave to each H2, in document order. */
export function legacyH2Anchors(html: string): string[] {
  return byTag(parseHtml(html), 'h2').map((h) => legacyAnchor(innerHtml(h)));
}

/**
 * Rewrites Markdown H2 lines as JSX headings with the legacy id wherever github-slugger would give
 * a different anchor. Explicit ids do not advance the slugger, so anchors are recomputed after
 * each replacement. A legacy id that is already used in the document is left alone (the legacy
 * site could only ever reach the first one).
 */
export function applyLegacyAnchors(
  body: string,
  legacy: string[],
  ctx: ConvertContext,
  allowed?: Set<string>,
): string {
  const lines = body.split('\n');
  const h2Lines = () => lines.map((l, i) => (/^(## |<h2 id=)/.test(l) ? i : -1)).filter((i) => i >= 0);
  const count = extractHeadings(body).filter((h) => h.depth === 2).length;
  if (count !== legacy.length) {
    ctx.issue(
      'anchors',
      `H2 count ${count} differs from source ${legacy.length}; legacy anchors not applied`,
    );
    return body;
  }
  for (const [k, want] of legacy.entries()) {
    const all = extractHeadings(lines.join('\n'));
    const head = all.filter((h) => h.depth === 2)[k];
    if (!head || head.anchor === want || !want || (allowed && !allowed.has(want))) continue;
    if (all.some((h) => h.anchor === want)) {
      ctx.issue('anchors', `legacy anchor #${want} repeats in the document; kept #${head.anchor}`);
      continue;
    }
    const lineNo = h2Lines()[k];
    if (lineNo === undefined) continue;
    lines[lineNo] = `<h2 id="${want}">${(lines[lineNo] ?? '').replace(/^## /, '')}</h2>`;
  }
  return lines.join('\n');
}

/**
 * Rich text HTML → MDX body (no frontmatter). `allowedAnchors`: ids the live page really had
 * (from the snapshot); the legacy id script did not run on every template.
 */
export function htmlToMdx(html: string, ctx: ConvertContext, allowedAnchors?: Set<string>): string {
  const hast = fromHtml(html, { fragment: true });
  cleanHast(hast);
  const mdast = toMdast(hast, { handlers: handlers(ctx) }) as Root;
  postMdast(mdast, ctx);
  const body = stringify(mdast).trim() + '\n';
  return applyLegacyAnchors(body, legacyH2Anchors(html), ctx, allowedAnchors);
}

/** HTML fragment → Markdown for a YAML string (FAQ answers): blocks separated by blank lines. */
export function htmlToMarkdownString(html: string, ctx: ConvertContext): string {
  const hast = fromHtml(html, { fragment: true });
  cleanHast(hast);
  const mdast = toMdast(hast, { handlers: handlers(ctx) }) as Root;
  postMdast(mdast, ctx);
  return stringify(mdast).trim();
}

/** Splits a Webflow FAQ rich text field (h3 question + following blocks) into q/a pairs. */
export function parseFaq(html: string, ctx: ConvertContext): { q: string; a: string }[] {
  const hast = fromHtml(html, { fragment: true });
  cleanHast(hast);
  const faq: { q: string; a: string }[] = [];
  let current: { q: string; parts: Element[] } | null = null;
  const flush = () => {
    if (!current) return;
    const a = htmlToMarkdownString(toHtml(current.parts), ctx);
    if (a) faq.push({ q: current.q, a });
    else ctx.issue('faq', `question without answer dropped: ${current.q}`);
  };
  for (const node of hast.children) {
    if (node.type !== 'element') continue;
    if (/^h[2-6]$/.test(node.tagName)) {
      flush();
      current = { q: toText(node).replace(/\s+/g, ' ').trim(), parts: [] };
    } else if (node.tagName === 'div' && elements(node, 'script').length) {
      continue; // the FAQPage JSON-LD generator script
    } else if (current) current.parts.push(node);
    else if (toText(node).trim())
      ctx.issue('faq', `text before the first question dropped: ${toText(node).slice(0, 60)}`);
  }
  flush();
  return faq;
}
