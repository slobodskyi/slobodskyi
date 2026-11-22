import { MemorySource, serializeDocument } from '../src/index.ts';

export const doc = (data: Record<string, unknown>, body = ''): string => serializeDocument(data, body);

const base = { visibility: 'public', status: 'published', created: '2024-03-01', updated: '2026-06-10' };

/** A small valid site: monetize hub, payments category (en+uk), payoneer guide (en+uk), home page. */
export function site(extra: Record<string, string> = {}): MemorySource {
  return new MemorySource({
    'hubs/monetize/en.mdx': doc({
      type: 'hub',
      title: 'Monetize',
      description: 'd',
      hub: 'monetize',
      ...base,
    }),
    'categories/payments/en.mdx': doc({
      type: 'category',
      title: 'Payments',
      description: 'd',
      hub: 'monetize',
      category: 'payments',
      ...base,
    }),
    'categories/payments/uk.mdx': doc({
      type: 'category',
      title: 'Платежі',
      description: 'd',
      hub: 'monetize',
      category: 'payments',
      ...base,
    }),
    'guides/payoneer/en.mdx': doc(
      {
        type: 'guide',
        title: 'Payoneer',
        description: 'How to use Payoneer',
        hub: 'monetize',
        category: 'payments',
        slug: 'payoneer',
        ...base,
      },
      '## What is Payoneer?\n\nSee [PayPal](/monetize/payments/paypal).\n',
    ),
    'guides/payoneer/uk.mdx': doc({
      type: 'guide',
      title: 'Payoneer',
      description: 'Як користуватись Payoneer',
      hub: 'monetize',
      category: 'payments',
      slug: 'payoneer',
      ...base,
    }),
    'pages/home/en.mdx': doc({ type: 'page', title: 'Home', description: 'd', path: '/', ...base }),
    ...extra,
  });
}

export const guide = (fields: Record<string, unknown> = {}, body = ''): string =>
  doc(
    {
      type: 'guide',
      title: 'T',
      description: 'D',
      hub: 'monetize',
      category: 'payments',
      slug: 'x',
      ...base,
      ...fields,
    },
    body,
  );
