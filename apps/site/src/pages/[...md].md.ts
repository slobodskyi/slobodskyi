// Markdown copy of every published record except home pages: <url>.md, linked from the page
// with <link rel="alternate" type="text/markdown">. MDX components become plain Markdown.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getImage } from 'astro:assets';
import { SITE } from '@slobodskyi/core';
import { absoluteUrl, publishedRecords, type Rec } from '../lib/content';
import { isOptimizable, resolveImage } from '../lib/images';
import { markdownPath } from '../lib/seo';

export const getStaticPaths = (async () =>
  (await publishedRecords())
    .filter((rec) => markdownPath(rec))
    .map((rec) => ({ params: { md: rec.url.slice(1) }, props: { rec } }))) satisfies GetStaticPaths;

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`)
    .exec(tag)
    ?.slice(1)
    .find((v) => v !== undefined);

async function imageUrl(rec: Rec, src: string): Promise<string> {
  const img = await resolveImage(rec.dir, src);
  if (!isOptimizable(img)) return absoluteUrl(img.src);
  const out = await getImage({ src: img, width: Math.min(img.width, 1600), format: 'webp', quality: 72 });
  return absoluteUrl(out.src);
}

async function toMarkdown(rec: Rec): Promise<string> {
  let body = rec.entry.body ?? '';
  // Images first (async), then the synchronous rewrites.
  const shots = [...body.matchAll(/<Shot\b[^>]*\/>/g)];
  for (const m of shots) {
    const tag = m[0];
    const src = attr(tag, 'src');
    const replacement = src ? `![${attr(tag, 'alt') ?? ''}](${await imageUrl(rec, src)})` : '';
    body = body.replace(tag, replacement);
  }
  body = body
    .replace(
      /^\s*<h([1-6])\s+id=["'][^"']*["'][^>]*>(.*?)<\/h\1>\s*$/gim,
      (_, d: string, text: string) =>
        `${'#'.repeat(Number(d))} ${text.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')}`,
    )
    .replace(/<Callout>\s*([\s\S]*?)\s*<\/Callout>/g, (_, inner: string) =>
      inner
        .split('\n')
        .map((l) => `> ${l.trim()}`.trimEnd())
        .join('\n'),
    )
    .replace(/<Answer>\s*([\s\S]*?)\s*<\/Answer>/g, '$1')
    .replace(
      /<YouTube\b[^>]*\/>/g,
      (tag) => `[YouTube video](https://www.youtube.com/watch?v=${attr(tag, 'id')})`,
    )
    .replace(/<VideoAsk\b[^>]*\/>/g, (tag) => `[VideoAsk](https://www.videoask.com/${attr(tag, 'id')})`)
    .replace(
      /<BuyMeACoffee\b[^>]*\/>/g,
      (tag) =>
        `[${attr(tag, 'text') ?? 'Buy me a coffee'}](https://www.buymeacoffee.com/${attr(tag, 'slug')})`,
    )
    .replace(/<Quiz\b[^>]*\/>\n?/g, '')
    .replace(/\]\(\//g, `](${SITE}/`);
  const d = rec.data;
  const faq =
    'faq' in d && d.faq.length ? '\n\n' + d.faq.map((f) => `### ${f.q}\n\n${f.a}`).join('\n\n') : '';
  const front = [
    '---',
    `title: ${JSON.stringify(d.title)}`,
    d.description ? `description: ${JSON.stringify(d.description)}` : '',
    `url: ${absoluteUrl(rec.url)}`,
    `lang: ${rec.lang}`,
    `updated: ${d.updated}`,
    '---',
  ].filter(Boolean);
  return `${front.join('\n')}\n\n# ${d.title}\n\n${d.lead ? `${d.lead}\n\n` : ''}${body.trim()}${faq}\n`;
}

export const GET: APIRoute = async ({ props }) =>
  new Response(await toMarkdown((props as { rec: Rec }).rec), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
