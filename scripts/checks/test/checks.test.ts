import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runBuildChecks, type ContentExpectations } from '../build.ts';
import { renderReport, runParity, type LegacyPage } from '../parity.ts';

function makeDist(files: Record<string, string>): string {
  const dist = mkdtempSync(join(tmpdir(), 'dist-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dist, name)), { recursive: true });
    writeFileSync(join(dist, name), content);
  }
  return dist;
}

interface PageOpts {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string;
  h1?: string[];
  hreflang?: Record<string, string>;
  body?: string;
  head?: string;
}

function page(o: PageOpts = {}): string {
  const hreflang = Object.entries(o.hreflang ?? { en: '/' })
    .map(([l, h]) => `<link rel="alternate" hreflang="${l}" href="https://slobodskyi.com${h}">`)
    .join('');
  return `<!doctype html><html><head><title>${o.title ?? 'T'}</title>
<meta name="description" content="${o.description ?? 'D'}">
<link rel="canonical" href="${o.canonical ?? 'https://slobodskyi.com'}">
${o.robots ? `<meta name="robots" content="${o.robots}">` : ''}${hreflang}${o.head ?? ''}</head>
<body>${(o.h1 ?? ['Hello']).map((h) => `<h1>${h}</h1>`).join('')}${o.body ?? ''}</body></html>`;
}

const legacy = (o: Partial<LegacyPage> = {}): LegacyPage => ({
  url: '/',
  status: 200,
  redirectTo: null,
  title: 'T',
  description: 'D',
  canonical: 'https://slobodskyi.com',
  robots: null,
  h1: ['Hello'],
  hreflang: { en: '/' },
  ...o,
});

describe('parity', () => {
  const empty = { differences: [] };

  it('passes when everything matches (file format: / → index.html, /a/b → a/b.html)', () => {
    const dist = makeDist({
      'index.html': page(),
      'ua.html': page({ canonical: 'https://slobodskyi.com/ua', hreflang: { uk: '/ua' } }),
      'a/b.html': page({ canonical: 'https://slobodskyi.com/a/b', hreflang: { en: '/a/b' } }),
    });
    const pages = [
      legacy(),
      legacy({ url: '/ua', canonical: 'https://slobodskyi.com/ua', hreflang: { uk: '/ua' } }),
      legacy({ url: '/a/b', canonical: 'https://slobodskyi.com/a/b', hreflang: { en: '/a/b' } }),
    ];
    const r = runParity({ dist, pages, allowlist: empty });
    expect(r.critical).toBe(0);
    expect(r.matching).toBe(3);
  });

  it('reports every differing field', () => {
    const dist = makeDist({
      'index.html': page({
        title: 'X',
        description: 'Y',
        canonical: 'https://x',
        robots: 'noindex',
        h1: ['A', 'B'],
        hreflang: { en: '/z' },
      }),
    });
    const r = runParity({ dist, pages: [legacy()], allowlist: empty });
    expect(r.differences.map((d) => d.field).sort()).toEqual([
      'canonical',
      'description',
      'h1',
      'hreflang',
      'robots',
      'title',
    ]);
    expect(r.critical).toBe(6);
  });

  it('lists missing pages instead of crashing on an empty dist', () => {
    const dist = makeDist({});
    const r = runParity({ dist, pages: [legacy(), legacy({ url: '/about' })], allowlist: empty });
    expect(r.missing).toEqual(['/', '/about']);
    expect(r.critical).toBe(2);
    expect(renderReport(r, 'dist')).toContain('## Missing pages');
  });

  it('accepts documented differences, but only with a matching expected value', () => {
    const dist = makeDist({ 'index.html': page({ title: 'Fixed' }) });
    const allow = (expected?: unknown) => ({
      differences: [{ url: '/', field: 'title', reason: 'fixed defect', ...(expected ? { expected } : {}) }],
    });
    expect(runParity({ dist, pages: [legacy()], allowlist: allow() }).critical).toBe(0);
    expect(runParity({ dist, pages: [legacy()], allowlist: allow('Fixed') }).critical).toBe(0);
    expect(runParity({ dist, pages: [legacy()], allowlist: allow('Other') }).critical).toBe(1);
  });

  it('compares robots as a set of directives across all robots metas', () => {
    const run = (robots: string) =>
      runParity({
        dist: makeDist({ 'index.html': page({ robots }) }),
        pages: [legacy({ robots: 'noindex, max-image-preview:large' })],
        allowlist: empty,
      }).critical;
    expect(run('max-image-preview:large, NOINDEX')).toBe(0);
    expect(run('max-image-preview:large')).toBe(1);
    const twoTags = makeDist({
      'index.html': page({
        robots: 'noindex',
        head: '<meta name="robots" content="max-image-preview:large">',
      }),
    });
    expect(
      runParity({
        dist: twoTags,
        pages: [legacy({ robots: 'noindex, max-image-preview:large' })],
        allowlist: empty,
      }).critical,
    ).toBe(0);
  });

  it('flags stale allowlist entries', () => {
    const dist = makeDist({ 'index.html': page() });
    const r = runParity({
      dist,
      pages: [legacy()],
      allowlist: { differences: [{ url: '/gone', field: '*', reason: 'x' }] },
    });
    expect(r.unusedAllowlist).toHaveLength(1);
  });

  it('checks redirects and legacy 404s', () => {
    const dist = makeDist({ _redirects: '/old /new 301\n', 'index.html': page() });
    const ok = runParity({
      dist,
      pages: [
        legacy({ url: '/old', status: 301, redirectTo: '/new' }),
        legacy({ url: '/gone', status: 404 }),
      ],
      allowlist: empty,
    });
    expect(ok.critical).toBe(0);
    const bad = runParity({
      dist,
      pages: [legacy({ url: '/old', status: 301, redirectTo: '/other' }), legacy({ url: '/', status: 404 })],
      allowlist: empty,
    });
    expect(bad.critical).toBe(2);
  });

  it('treats a 301 in _redirects for a live legacy URL as a difference', () => {
    const dist = makeDist({ _redirects: '/about /x 301\n' });
    const r = runParity({ dist, pages: [legacy({ url: '/about' })], allowlist: empty });
    expect(r.differences[0]?.field).toBe('status');
  });
});

describe('build checks', () => {
  const none: ContentExpectations = {
    noindexUrls: new Set(),
    hiddenUrls: new Set(),
    hiddenAddresses: new Set(),
  };
  const checks = (dist: string, exp = none) =>
    runBuildChecks({ dist, expectations: exp }).problems.map((p) => p.check);

  it('passes on a clean dist', () => {
    const dist = makeDist({
      'index.html': page({
        body: '<a href="/about">a</a><a href="https://example.com/x">e</a><a href="/_astro/a.css">c</a><img src="/x.png" alt="">',
        head: '<script type="application/ld+json">{"@type":"WebPage"}</script>',
      }),
      'about.html': page({ canonical: 'https://slobodskyi.com/about' }),
      '_astro/a.css': 'body{}',
      'x.png': 'png',
    });
    expect(checks(dist)).toEqual([]);
  });

  it('flags broken links, missing alt, H1 count, CDN, bad JSON-LD', () => {
    const dist = makeDist({
      'index.html': page({
        h1: ['A', 'B'],
        body: '<a href="/nope">x</a><img src="/i.png"><p>https://cdn.prod.website-files.com/abc/img.webp</p>',
        head: '<script type="application/ld+json">{oops</script>',
      }),
      'no-h1.html': page({ h1: [] }),
    });
    const found = new Set(checks(dist));
    expect(found).toEqual(new Set(['h1', 'links', 'alt', 'cdn', 'jsonld']));
  });

  it('accepts redirected targets and trailing slashes', () => {
    const dist = makeDist({
      _redirects: '/old /new 301\n',
      'new.html': page(),
      'index.html': page({ body: '<a href="/old">o</a><a href="/new/">n</a>' }),
    });
    expect(checks(dist)).toEqual([]);
  });

  it('has no exceptions: a link to a legacy 404 fails on every page', () => {
    const dist = makeDist({
      'courses.html': page({ body: '<a href="/ua/courses/chatgpt">k</a>' }),
      'new-guide.html': page({ body: '<a href="https://slobodskyi.com/ua/courses/chatgpt">k</a>' }),
    });
    const problems = runBuildChecks({ dist, expectations: none }).problems;
    expect(problems.map((p) => `${p.check} ${p.url}`)).toEqual(['links /courses', 'links /new-guide']);
  });

  it('noindex only where frontmatter says so (both directions)', () => {
    const dist = makeDist({
      'index.html': page({ robots: 'noindex' }),
      'hidden.html': page({ robots: 'noindex' }),
      'forgot.html': page(),
    });
    const exp = { ...none, noindexUrls: new Set(['/hidden', '/forgot']) };
    const problems = runBuildChecks({ dist, expectations: exp }).problems;
    expect(problems.map((p) => p.url).sort()).toEqual(['/', '/forgot']);
  });

  it('private content must not be built or mentioned by address', () => {
    const dist = makeDist({
      'index.html': page({ body: '<!-- notes/secret:en -->' }),
      'notes/secret.html': page(),
    });
    const exp = {
      ...none,
      hiddenUrls: new Set(['/notes/secret']),
      hiddenAddresses: new Set(['notes/secret:en']),
    };
    expect(checks(dist, exp)).toEqual(['private', 'private']);
    expect(checks(makeDist({ 'index.html': page() }), exp)).toEqual([]);
  });
});
