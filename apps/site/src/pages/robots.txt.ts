import type { APIRoute } from 'astro';

export const GET: APIRoute = () =>
  new Response(
    [
      // Content Signals (contentsignals.org): owner decision 2026-11-22, all uses allowed.
      'User-agent: *',
      'Content-Signal: search=yes, ai-input=yes, ai-train=yes',
      'Allow: /',
      'Disallow: /api/',
      '',
      'Sitemap: https://slobodskyi.com/sitemap.xml',
      '',
    ].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
