import { describe, expect, it } from 'vitest';
import {
  createAnchorer,
  extractHeadings,
  extractInternalLinks,
  frontmatterSchema,
  internalPath,
  legacyAnchor,
  parseDocument,
  refFromPath,
  serializeDocument,
  urlFor,
  type Frontmatter,
} from '../src/index.ts';

describe('legacyAnchor (Webflow H2 ids)', () => {
  it.each([
    // Observed on the live site, November 2026.
    ['What is Payoneer?', 'what-is-payoneer'],
    ["What are Payoneer's fees and rates?", 'what-are-payoneers-fees-and-rates'],
    ['How to create a Payoneer account?', 'how-to-create-a-payoneer-account'],
    ['Що таке Payoneer?', 'що-таке-payoneer'],
    ['Які комісії та тарифи у Payoneer?', 'які-комісії-та-тарифи-у-payoneer'],
    ['Відгуки про Payoneer', 'відгуки-про-payoneer'],
    // Quirks of the original script, kept on purpose.
    ['Fees &amp; rates', 'fees-amp-rates'],
    ['A  —  B', 'a-—-b'],
    ['Step 1: <strong>Sign up</strong>', 'step-1-strongsign-upstrong'],
  ])('%s → %s', (html, anchor) => {
    expect(legacyAnchor(html)).toBe(anchor);
  });
});

describe('createAnchorer (Astro / github-slugger)', () => {
  it('slugs and de-duplicates like Astro', () => {
    const a = createAnchorer();
    expect(a('What is Payoneer?')).toBe('what-is-payoneer');
    expect(a('Що таке Payoneer?')).toBe('що-таке-payoneer');
    expect(a('FAQ')).toBe('faq');
    expect(a('FAQ')).toBe('faq-1');
  });
});

const fm = (data: Record<string, unknown>): Frontmatter =>
  frontmatterSchema.parse({
    visibility: 'public',
    status: 'published',
    created: '2024-01-01',
    updated: '2024-01-01',
    title: 't',
    ...data,
  });

describe('urlFor', () => {
  const g = fm({ type: 'guide', hub: 'monetize', category: 'payments', slug: 'payoneer' });
  it.each([
    ['en', '/monetize/payments/payoneer'],
    ['uk', '/ua/monetize/payments/payoneer'],
    ['ru', '/ru/monetize/payments/payoneer'],
  ] as const)('guide in %s', (lang, url) => expect(urlFor(lang, 'guides', g)).toBe(url));

  it('hubs, categories, pages and the home page', () => {
    expect(urlFor('uk', 'hubs', fm({ type: 'hub', hub: 'grow' }))).toBe('/ua/grow');
    expect(urlFor('en', 'categories', fm({ type: 'category', hub: 'create', category: 'ai' }))).toBe(
      '/create/ai',
    );
    expect(urlFor('ru', 'pages', fm({ type: 'page', path: '/courses/consultation' }))).toBe(
      '/ru/courses/consultation',
    );
    expect(urlFor('en', 'pages', fm({ type: 'page', path: '/' }))).toBe('/');
    expect(urlFor('uk', 'pages', fm({ type: 'page', path: '/' }))).toBe('/ua');
  });

  it('provisional scheme for other types', () => {
    expect(urlFor('en', 'essays', fm({ type: 'essay', slug: 'slow' }))).toBe('/essays/slow');
  });
});

describe('internalPath', () => {
  it.each([
    ['/monetize/payments/paypal', '/monetize/payments/paypal'],
    ['/about/', '/about'],
    ['/about?x=1#top', '/about'],
    ['https://slobodskyi.com/ua/tools', '/ua/tools'],
    ['https://slobodskyi.com', '/'],
    ['https://slobo.click/payoneer', null],
    ['//cdn.example.com/x', null],
    ['#faq', null],
    ['mailto:a@b.c', null],
  ])('%s → %s', (href, path) => expect(internalPath(href)).toBe(path));
});

describe('extractHeadings', () => {
  it('reads JSX headings with legacy ids, strips inline markup and skips code blocks', () => {
    const body = [
      '<h2 id="fees-amp-rates">Fees &amp; <strong>rates</strong></h2>',
      'text',
      '```md',
      '## not a heading',
      '```',
      '### Fees in [USD](/x)',
      '## What is **Payoneer**?',
      '## FAQ',
      '## FAQ',
    ].join('\n');
    expect(extractHeadings(body)).toEqual([
      { depth: 2, text: 'Fees & rates', anchor: 'fees-amp-rates', explicit: true },
      { depth: 3, text: 'Fees in USD', anchor: 'fees-in-usd', explicit: false },
      { depth: 2, text: 'What is Payoneer?', anchor: 'what-is-payoneer', explicit: false },
      { depth: 2, text: 'FAQ', anchor: 'faq', explicit: false },
      { depth: 2, text: 'FAQ', anchor: 'faq-1', explicit: false },
    ]);
  });
});

describe('extractInternalLinks', () => {
  it('collects Markdown links and href attributes, ignores external links and code', () => {
    const body = [
      'See [PayPal](/monetize/payments/paypal "PayPal") and [Wise](https://slobodskyi.com/monetize/payments/wise/).',
      '<a href="/ua/tools">tools</a> [aff](https://slobo.click/x) [top](#top)',
      '```',
      '[ignored](/nope)',
      '```',
    ].join('\n');
    expect(extractInternalLinks(body)).toEqual([
      '/monetize/payments/paypal',
      '/monetize/payments/wise',
      '/ua/tools',
    ]);
  });
});

describe('frontmatter', () => {
  it('keeps dates as strings and round-trips', () => {
    const raw = serializeDocument({ title: 'T', created: '2024-03-01' }, '# Body\n');
    const { data, body } = parseDocument(raw);
    expect(data).toEqual({ title: 'T', created: '2024-03-01' });
    expect(body.trim()).toBe('# Body');
  });

  it('rejects files without frontmatter', () => {
    expect(() => parseDocument('# no frontmatter')).toThrow(/frontmatter/);
  });

  it('accepts Date objects (Astro YAML) and normalises them to strings', () => {
    const parsed = fm({ type: 'hub', hub: 'grow', created: new Date('2024-03-01T00:00:00Z') });
    expect(parsed.created).toBe('2024-03-01');
  });

  it('rejects unknown fields (typos)', () => {
    expect(() => fm({ type: 'hub', hub: 'grow', tittle: 'x' })).toThrow();
  });
});

describe('refFromPath', () => {
  it('parses valid paths and explains invalid ones', () => {
    expect(refFromPath('guides/payoneer/uk.mdx')).toEqual({
      ok: true,
      ref: { collection: 'guides', id: 'payoneer', lang: 'uk', ext: 'mdx' },
    });
    expect(refFromPath('guides/payoneer.mdx').ok).toBe(false);
    expect(refFromPath('blog/payoneer/en.mdx')).toMatchObject({ ok: false, message: /unknown collection/ });
    expect(refFromPath('guides/Payoneer/en.mdx')).toMatchObject({ ok: false, message: /invalid id/ });
    expect(refFromPath('guides/payoneer/ua.mdx')).toMatchObject({ ok: false, message: /unknown language/ });
  });
});
