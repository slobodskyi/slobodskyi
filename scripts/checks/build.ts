// Build checks over a dist folder: broken internal links, images without alt, one H1 per page,
// no Webflow CDN URLs, noindex only where frontmatter says so, valid JSON-LD, no private content.
//   pnpm check:build [--dist apps/site/dist]
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { FsSource } from '@slobodskyi/core/fs';
import { isPublished, loadRecords } from '@slobodskyi/core';
import { attr, byTag, type Node } from '../lib/html.ts';
import { findCdnUrls } from '../lib/cdn.ts';
import {
  extractFacts,
  jsonLdScripts,
  ORIGIN,
  parsePage,
  readRedirects,
  toPath,
  urlForFile,
  walkFiles,
} from './lib.ts';
import { loadAllowlist } from './parity.ts';

export interface ContentExpectations {
  /** URLs whose frontmatter says `noindex: true`: the only pages allowed to carry noindex. */
  noindexUrls: Set<string>;
  /** URLs and addresses of private or unpublished records: must not appear in the build. */
  hiddenUrls: Set<string>;
  hiddenAddresses: Set<string>;
}

export interface BuildProblem {
  check: 'links' | 'alt' | 'h1' | 'cdn' | 'noindex' | 'jsonld' | 'private';
  url: string;
  message: string;
}

export interface BuildCheckResult {
  pages: number;
  problems: BuildProblem[];
}

const TEXT_EXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.md', '.txt', '.svg']);

const isInternal = (href: string): boolean =>
  (href.startsWith('/') && !href.startsWith('//')) || href.startsWith(ORIGIN);

export function runBuildChecks(opts: {
  dist: string;
  expectations: ContentExpectations;
  /** Broken link targets that are known and accepted. */
  brokenLinkAllowlist?: string[] | undefined;
}): BuildCheckResult {
  const { dist, expectations } = opts;
  const allowedBroken = new Set((opts.brokenLinkAllowlist ?? []).map(toPath));
  const redirects = readRedirects(dist);
  const problems: BuildProblem[] = [];
  const files = walkFiles(dist);
  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const pageUrls = new Set(htmlFiles.map((f) => urlForFile(dist, f)));

  const linkExists = (target: string): boolean => {
    const p = toPath(target);
    if (pageUrls.has(p) || redirects.has(p)) return true;
    return extname(p) !== '' && existsSync(join(dist, p));
  };

  for (const file of files) {
    if (!TEXT_EXT.has(extname(file))) continue;
    const text = readFileSync(file, 'utf8');
    const where = file.endsWith('.html') ? urlForFile(dist, file) : file.slice(dist.length);
    for (const cdn of findCdnUrls(text))
      problems.push({ check: 'cdn', url: where, message: `Webflow CDN URL: ${cdn}` });
  }

  for (const file of htmlFiles) {
    const url = urlForFile(dist, file);
    const doc: Node = parsePage(readFileSync(file, 'utf8'));
    const facts = extractFacts(doc);

    if (facts.h1.length !== 1)
      problems.push({ check: 'h1', url, message: `${facts.h1.length} H1 elements (expected 1)` });

    for (const img of byTag(doc, 'img'))
      if (attr(img, 'alt') === undefined)
        problems.push({ check: 'alt', url, message: `<img> without alt: ${attr(img, 'src') ?? '(no src)'}` });

    const refs = [
      ...byTag(doc, 'a').map((n) => attr(n, 'href')),
      ...byTag(doc, 'img').map((n) => attr(n, 'src')),
    ];
    for (const href of new Set(refs)) {
      if (!href || !isInternal(href) || linkExists(href) || allowedBroken.has(toPath(href))) continue;
      problems.push({ check: 'links', url, message: `broken internal link: ${href}` });
    }

    const noindex = /noindex/i.test(facts.robots ?? '');
    if (noindex && !expectations.noindexUrls.has(url))
      problems.push({
        check: 'noindex',
        url,
        message: `noindex but frontmatter has no noindex: true (${facts.robots})`,
      });
    if (!noindex && expectations.noindexUrls.has(url))
      problems.push({
        check: 'noindex',
        url,
        message: 'frontmatter says noindex: true but the page has no noindex robots meta',
      });

    jsonLdScripts(doc).forEach((raw, i) => {
      try {
        JSON.parse(raw);
      } catch (e) {
        problems.push({
          check: 'jsonld',
          url,
          message: `JSON-LD block ${i + 1} does not parse: ${(e as Error).message}`,
        });
      }
    });
  }

  for (const url of expectations.hiddenUrls)
    if (pageUrls.has(toPath(url)) || redirects.has(toPath(url)))
      problems.push({
        check: 'private',
        url,
        message: 'private or unpublished record is present in the build',
      });
  if (expectations.hiddenAddresses.size) {
    for (const file of files) {
      if (!TEXT_EXT.has(extname(file))) continue;
      const text = readFileSync(file, 'utf8');
      for (const address of expectations.hiddenAddresses)
        if (text.includes(address))
          problems.push({
            check: 'private',
            url: file.slice(dist.length),
            message: `contains address of a hidden record: ${address}`,
          });
    }
  }

  return { pages: htmlFiles.length, problems };
}

export async function loadExpectations(contentRoot: string): Promise<ContentExpectations> {
  const { records } = await loadRecords(new FsSource(contentRoot));
  const exp: ContentExpectations = {
    noindexUrls: new Set(),
    hiddenUrls: new Set(),
    hiddenAddresses: new Set(),
  };
  for (const r of records) {
    if (isPublished(r.data)) {
      if (r.data.noindex) exp.noindexUrls.add(r.url);
    } else {
      exp.hiddenUrls.add(r.url);
      exp.hiddenAddresses.add(r.address);
    }
  }
  return exp;
}

async function main(): Promise<number> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const { values } = parseArgs({
    options: {
      dist: { type: 'string', default: 'apps/site/dist' },
      allowlist: { type: 'string', default: 'data/parity-allowlist.json' },
    },
  });
  const dist = resolve(root, values.dist);
  if (!existsSync(dist)) {
    console.error(`✗ ${values.dist} does not exist: run \`pnpm build\` first`);
    return 2;
  }
  const allowlist = loadAllowlist(resolve(root, values.allowlist));
  const result = runBuildChecks({
    dist,
    expectations: await loadExpectations(join(root, 'content')),
    brokenLinkAllowlist: allowlist.brokenLinks?.map((b) => b.target),
  });
  for (const p of result.problems) console.log(`✗ [${p.check}] ${p.url}: ${p.message}`);
  console.log(
    `${result.problems.length ? '✗' : '✓'} ${result.pages} pages, ${result.problems.length} problems`,
  );
  return result.problems.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(await main());
