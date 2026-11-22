// Parity check: every URL of the legacy snapshot against the built site (status, title, description,
// canonical, robots, H1, hreflang). Documented differences live in data/parity-allowlist.json.
//   pnpm check:parity [--dist apps/site/dist] [--report data/parity-report.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { extractFacts, findBuiltFile, parsePage, readRedirects, toPath, type PageFacts } from './lib.ts';

export interface LegacyPage {
  url: string;
  status: number;
  redirectTo: string | null;
  title: string;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  h1: string[];
  hreflang: Record<string, string>;
}

export interface AllowedDifference {
  /** Exact URL, or a prefix ending in `*` (e.g. `/ua/*`). */
  url: string;
  /** A compared field, `status`, or `*`. */
  field: string;
  reason: string;
  /** When set, the built value must equal this; otherwise any value is accepted. */
  expected?: unknown;
}

export interface Allowlist {
  differences: AllowedDifference[];
  /** Internal link targets that are known to be broken on purpose (used by the build check). */
  brokenLinks?: { target: string; reason: string }[];
}

export type Field = 'status' | 'title' | 'description' | 'canonical' | 'robots' | 'h1' | 'hreflang';

export interface Difference {
  url: string;
  field: Field;
  legacy: unknown;
  built: unknown;
  allowed?: string; // reason, when documented
}

export interface ParityResult {
  total: number;
  matching: number;
  missing: string[];
  differences: Difference[];
  /** Allowlist entries that matched nothing: stale, should be removed. */
  unusedAllowlist: AllowedDifference[];
  critical: number;
}

const matchesUrl = (pattern: string, url: string): boolean =>
  pattern.endsWith('*') ? url.startsWith(pattern.slice(0, -1)) : pattern === url;

const norm = (v: string | null | undefined): string => (v ?? '').trim();
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const sortKeys = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort());

function compareFacts(legacy: LegacyPage, built: PageFacts): Difference[] {
  const diffs: Difference[] = [];
  const add = (field: Field, l: unknown, b: unknown) =>
    diffs.push({ url: legacy.url, field, legacy: l, built: b });
  if (norm(legacy.title) !== norm(built.title)) add('title', legacy.title, built.title);
  if (norm(legacy.description) !== norm(built.description))
    add('description', legacy.description, built.description);
  if (norm(legacy.canonical) !== norm(built.canonical)) add('canonical', legacy.canonical, built.canonical);
  if (norm(legacy.robots) !== norm(built.robots)) add('robots', legacy.robots, built.robots);
  if (!sameJson(legacy.h1.map(norm), built.h1.map(norm))) add('h1', legacy.h1, built.h1);
  if (!sameJson(sortKeys(legacy.hreflang), sortKeys(built.hreflang)))
    add('hreflang', legacy.hreflang, built.hreflang);
  return diffs;
}

export function runParity(opts: { dist: string; pages: LegacyPage[]; allowlist: Allowlist }): ParityResult {
  const { dist, pages, allowlist } = opts;
  const redirects = readRedirects(dist);
  const used = new Set<AllowedDifference>();
  const differences: Difference[] = [];
  const missing: string[] = [];
  let matching = 0;

  const classify = (d: Difference): void => {
    const entry = allowlist.differences.find(
      (a) =>
        matchesUrl(a.url, d.url) &&
        (a.field === '*' || a.field === d.field) &&
        (a.expected === undefined || sameJson(a.expected, d.built)),
    );
    if (entry) {
      used.add(entry);
      d.allowed = entry.reason;
    }
    differences.push(d);
  };

  for (const page of pages) {
    const before = differences.length;
    const file = findBuiltFile(dist, page.url);
    const redirect = redirects.get(toPath(page.url));

    if (page.status >= 300 && page.status < 400) {
      const ok =
        redirect && redirect.status === page.status && toPath(redirect.to) === toPath(page.redirectTo ?? '');
      if (!ok)
        classify({
          url: page.url,
          field: 'status',
          legacy: `${page.status} → ${page.redirectTo}`,
          built: redirect ? `${redirect.status} → ${redirect.to}` : file ? '200' : '404',
        });
    } else if (page.status === 200) {
      if (redirect) {
        classify({
          url: page.url,
          field: 'status',
          legacy: 200,
          built: `${redirect.status} → ${redirect.to}`,
        });
      } else if (!file) {
        missing.push(page.url);
        classify({ url: page.url, field: 'status', legacy: 200, built: 404 });
      } else {
        for (const d of compareFacts(page, extractFacts(parsePage(readFileSync(file, 'utf8'))))) classify(d);
      }
    } else if (file || redirect) {
      // Legacy 404 (e.g. the known broken /ua/courses/chatgpt): the page must still not exist.
      classify({
        url: page.url,
        field: 'status',
        legacy: page.status,
        built: redirect ? `${redirect.status} → ${redirect.to}` : 200,
      });
    }
    if (differences.length === before) matching++;
  }

  return {
    total: pages.length,
    matching,
    missing,
    differences,
    unusedAllowlist: allowlist.differences.filter((a) => !used.has(a)),
    critical: differences.filter((d) => !d.allowed).length,
  };
}

const cell = (v: unknown): string =>
  (typeof v === 'string' ? v : JSON.stringify(v)).replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderReport(result: ParityResult, dist: string): string {
  const critical = result.differences.filter((d) => !d.allowed);
  const allowed = result.differences.filter((d) => d.allowed);
  const missingCritical = critical.filter((d) => d.field === 'status' && result.missing.includes(d.url));
  const other = critical.filter((d) => !missingCritical.includes(d));
  const lines = [
    '# Parity report: legacy Webflow snapshot vs build',
    '',
    `Generated by \`pnpm check:parity\` against \`${dist}\`. Do not edit by hand.`,
    '',
    `- URLs in the snapshot: **${result.total}**`,
    `- Identical: **${result.matching}**`,
    `- Missing pages: **${result.missing.length}**`,
    `- Undocumented differences: **${critical.length}** ${critical.length ? '(FAIL)' : '(ok)'}`,
    `- Documented differences: **${allowed.length}**`,
    '',
  ];
  if (other.length) {
    lines.push(
      '## Undocumented differences',
      '',
      '| URL | Field | Legacy | Built |',
      '| --- | --- | --- | --- |',
    );
    for (const d of other)
      lines.push(`| ${cell(d.url)} | ${d.field} | ${cell(d.legacy)} | ${cell(d.built)} |`);
    lines.push('');
  }
  if (result.missing.length) {
    lines.push('## Missing pages', '', ...result.missing.map((u) => `- \`${u}\``), '');
  }
  if (allowed.length) {
    lines.push(
      '## Documented differences',
      '',
      '| URL | Field | Legacy | Built | Reason |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const d of allowed)
      lines.push(
        `| ${cell(d.url)} | ${d.field} | ${cell(d.legacy)} | ${cell(d.built)} | ${cell(d.allowed)} |`,
      );
    lines.push('');
  }
  if (result.unusedAllowlist.length) {
    lines.push('## Stale allowlist entries (matched nothing, remove or fix)', '');
    for (const a of result.unusedAllowlist) lines.push(`- \`${a.url}\` ${a.field}: ${a.reason}`);
    lines.push('');
  }
  return lines.join('\n');
}

export const loadAllowlist = (file: string): Allowlist => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Allowlist;
  } catch {
    return { differences: [] };
  }
};

function main(): number {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const { values } = parseArgs({
    options: {
      dist: { type: 'string', default: 'apps/site/dist' },
      legacy: { type: 'string', default: 'data/legacy/pages.json' },
      allowlist: { type: 'string', default: 'data/parity-allowlist.json' },
      report: { type: 'string', default: 'data/parity-report.md' },
    },
  });
  const at = (p: string) => resolve(root, p);
  const pages = JSON.parse(readFileSync(at(values.legacy), 'utf8')) as LegacyPage[];
  const result = runParity({ dist: at(values.dist), pages, allowlist: loadAllowlist(at(values.allowlist)) });
  writeFileSync(at(values.report), renderReport(result, values.dist));
  console.log(
    `${result.critical ? '✗' : '✓'} ${result.matching}/${result.total} identical, ${result.missing.length} missing, ` +
      `${result.critical} undocumented differences → ${values.report}`,
  );
  return result.critical ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
