import { describe, expect, it } from 'vitest';
import {
  buildIndex,
  buildRedirects,
  create,
  parseDocument,
  parseRedirectsCsv,
  validate,
} from '../src/index.ts';
import { doc, guide, site } from './fixtures.ts';

const codes = (problems: { code: string }[]) => problems.map((p) => p.code);

describe('validate', () => {
  it('accepts a valid site', async () => {
    const result = await validate(site());
    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ ok: true, records: 6, published: 6 });
  });

  it('reports layout, schema and type errors per file', async () => {
    const result = await validate(
      site({
        'guides/stray.mdx': guide(),
        'guides/typo/en.mdx': guide({ slug: 'typo', tittle: 'x' }),
        'hubs/wrong/en.mdx': guide({ slug: 'wrong' }),
        'guides/nofm/en.mdx': 'no frontmatter',
      }),
    );
    expect(result.ok).toBe(false);
    expect(codes(result.errors).sort()).toEqual(['frontmatter', 'layout', 'schema', 'type']);
  });

  it('blocks private content outside notes/ and allows it in notes/', async () => {
    const result = await validate(
      site({
        'guides/secret/en.mdx': guide({ slug: 'secret', visibility: 'private' }),
        'notes/idea/en.md': doc({
          type: 'note',
          title: 'Idea',
          slug: 'idea',
          visibility: 'private',
          status: 'draft',
          created: '2026-01-01',
          updated: '2026-01-01',
        }),
      }),
    );
    expect(result.errors.map((e) => [e.code, e.address])).toEqual([['private', 'guides/secret:en']]);
  });

  it('finds URL conflicts, translation mismatches, missing categories and related records', async () => {
    const result = await validate(
      site({
        'guides/payoneer-copy/en.mdx': guide({ slug: 'payoneer' }),
        'guides/payoneer/ru.mdx': guide({ slug: 'payoneer', hub: 'grow' }),
        'guides/orphan/en.mdx': guide({ slug: 'orphan', category: 'nowhere', related: ['guides/missing'] }),
      }),
    );
    expect(new Set(codes(result.errors))).toEqual(
      new Set(['url-conflict', 'translation-mismatch', 'category', 'related']),
    );
  });

  it('checks dates, descriptions, schedules and legacy URLs', async () => {
    const result = await validate(
      site({
        'guides/a/en.mdx': guide({ slug: 'a', created: '2026-01-02', updated: '2026-01-01' }),
        'guides/b/en.mdx': guide({ slug: 'b', description: undefined }),
        'guides/c/en.mdx': guide({ slug: 'c', status: 'scheduled' }),
        'guides/d/en.mdx': guide({ slug: 'd', legacyUrls: ['/monetize/payments/payoneer'] }),
        'guides/e/en.mdx': guide({ slug: 'e', legacyUrls: ['/monetize/payments/e'] }),
        'guides/f/en.mdx': guide({ slug: 'f' }, '<h2 id="faq">Old FAQ</h2>\n\n## FAQ\n'),
      }),
    );
    expect(new Set(codes(result.errors))).toEqual(
      new Set(['dates', 'description', 'schedule', 'legacy-live', 'legacy-self', 'anchor']),
    );
  });
});

describe('create', () => {
  const today = '2026-11-22';

  it('creates a draft with defaults and returns its URL', async () => {
    const source = site();
    const result = await create(
      source,
      {
        collection: 'guides',
        id: 'wise',
        lang: 'en',
        fields: { title: 'Wise', hub: 'monetize', category: 'payments', slug: 'wise' },
      },
      { today },
    );
    expect(result).toMatchObject({ ok: true, path: 'guides/wise/en.mdx', url: '/monetize/payments/wise' });
    const { data } = parseDocument(await source.read('guides/wise/en.mdx'));
    expect(data).toMatchObject({
      type: 'guide',
      status: 'draft',
      visibility: 'public',
      created: today,
      updated: today,
    });
    expect((await validate(source)).ok).toBe(true);
  });

  it('creates a translation that inherits hub, category and slug', async () => {
    const source = site();
    const result = await create(
      source,
      { collection: 'guides', id: 'payoneer', lang: 'ru', fields: { title: 'Payoneer' } },
      { today },
    );
    expect(result).toMatchObject({ ok: true, url: '/ru/monetize/payments/payoneer' });
  });

  it('defaults notes to private', async () => {
    const source = site();
    await create(
      source,
      { collection: 'notes', id: 'idea', lang: 'uk', ext: 'md', fields: { title: 'Ідея', slug: 'idea' } },
      { today },
    );
    expect(parseDocument(await source.read('notes/idea/uk.md')).data).toMatchObject({
      visibility: 'private',
    });
  });

  it('never overwrites and rejects bad input', async () => {
    const source = site();
    const before = await source.read('guides/payoneer/en.mdx');
    const exists = await create(source, {
      collection: 'guides',
      id: 'payoneer',
      lang: 'en',
      fields: { title: 'X' },
    });
    expect(exists).toMatchObject({ ok: false, problems: [{ code: 'exists' }] });
    expect(await source.read('guides/payoneer/en.mdx')).toBe(before);

    const badId = await create(source, {
      collection: 'guides',
      id: 'Bad Id',
      lang: 'en',
      fields: { title: 'X' },
    });
    expect(badId).toMatchObject({ ok: false, problems: [{ code: 'id' }] });

    const noTitle = await create(source, {
      collection: 'guides',
      id: 'new',
      lang: 'en',
      fields: { hub: 'monetize', category: 'payments', slug: 'new' },
    });
    expect(noTitle).toMatchObject({ ok: false, problems: [{ code: 'schema' }] });

    const clash = await create(source, {
      collection: 'guides',
      id: 'other',
      lang: 'en',
      fields: { title: 'X', hub: 'monetize', category: 'payments', slug: 'payoneer' },
    });
    expect(clash).toMatchObject({ ok: false, problems: [{ code: 'url-conflict' }] });
    expect(await source.exists('guides/other/en.mdx')).toBe(false);
  });
});

describe('buildIndex', () => {
  it('includes only published public records, sorted, with headings, links and hashes', async () => {
    const source = site({ 'guides/draft/en.mdx': guide({ slug: 'draft', status: 'draft' }) });
    const { index, problems } = await buildIndex(source);
    expect(problems).toEqual([]);
    expect(index.entries.map((e) => e.address)).toEqual([
      'categories/payments:en',
      'categories/payments:uk',
      'guides/payoneer:en',
      'guides/payoneer:uk',
      'hubs/monetize:en',
      'pages/home:en',
    ]);
    const payoneer = index.entries.find((e) => e.address === 'guides/payoneer:en');
    expect(payoneer).toMatchObject({
      url: '/monetize/payments/payoneer',
      type: 'guide',
      headings: [{ depth: 2, text: 'What is Payoneer?', anchor: 'what-is-payoneer' }],
      links: ['/monetize/payments/paypal'],
    });
    expect(payoneer?.hash).toMatch(/^[0-9a-f]{64}$/);

    const again = await buildIndex(source);
    expect(again.index).toEqual(index);
    await source.write('guides/payoneer/en.mdx', (await source.read('guides/payoneer/en.mdx')) + 'more\n');
    const changed = (await buildIndex(source)).index.entries.find((e) => e.address === 'guides/payoneer:en');
    expect(changed?.hash).not.toBe(payoneer?.hash);
  });
});

describe('buildRedirects', () => {
  it('turns legacyUrls into 301s and flattens chains from static rules', async () => {
    const source = site({
      'guides/wise/en.mdx': guide({ slug: 'wise', legacyUrls: ['/monetize/payments/transferwise'] }),
    });
    const statics = parseRedirectsCsv(
      'from,to,status\n/blog,/ru,301\n/old-wise,/monetize/payments/transferwise\n',
      'test.csv',
    );
    expect(statics.problems).toEqual([]);
    const result = await buildRedirects(source, statics.rules);
    expect(result.ok).toBe(true);
    expect(result.file.split('\n').slice(1)).toEqual([
      '/blog /ru 301',
      '/monetize/payments/transferwise /monetize/payments/wise 301',
      '/old-wise /monetize/payments/wise 301',
      '',
    ]);
    // /blog → /ru warns because the fixture has no Russian home page.
    expect(codes(result.problems).sort()).toEqual(['redirect-chain', 'redirect-target']);
  });

  it('refuses rules that shadow live pages, conflict or loop', async () => {
    const result = await buildRedirects(site(), [
      { from: '/monetize/payments/payoneer', to: '/x', status: 301, origin: 't' },
      { from: '/a', to: '/b', status: 301, origin: 't' },
      { from: '/a', to: '/c', status: 301, origin: 't' },
      { from: '/b', to: '/a', status: 301, origin: 't' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.problems.filter((p) => p.level === 'error').map((p) => p.message)).toEqual([
      expect.stringMatching(/live page/),
      expect.stringMatching(/conflicts/),
      expect.stringMatching(/cycle/),
      expect.stringMatching(/cycle/),
    ]);
  });

  it('reports malformed CSV rows', () => {
    expect(parseRedirectsCsv('from,to\nnot-a-path,/x\n', 'bad.csv').problems).toHaveLength(1);
  });
});
