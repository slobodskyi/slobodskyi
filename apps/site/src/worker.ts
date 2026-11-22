/// <reference types="@cloudflare/workers-types" />
// Worker entry. Static pages are served from `dist` by Workers static assets; this code only
// runs for /api/* (see `run_worker_first` in wrangler.jsonc) and for preview noindex headers.

interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: 'production' | 'preview';
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    const response = await env.ASSETS.fetch(request);
    if (env.ENVIRONMENT !== 'preview') return response;

    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
} satisfies ExportedHandler<Env>;
