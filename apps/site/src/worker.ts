/// <reference types="@cloudflare/workers-types" />
// Worker entry. Static pages are served from `dist` by Workers static assets; this code only
// runs for /api/*, for paths ending in "/" (see `run_worker_first` in wrangler.jsonc) and, on the
// preview, for every request to add noindex headers.

interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: 'production' | 'preview';
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    // /about/ -> 301 /about (the legacy site used 301; assets' own redirect is a 307).
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      const target = new URL(url);
      target.pathname = url.pathname.replace(/\/+$/, '') || '/';
      return withPreviewHeaders(Response.redirect(target.toString(), 301), env);
    }

    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    return withPreviewHeaders(await env.ASSETS.fetch(request), env);
  },
} satisfies ExportedHandler<Env>;

function withPreviewHeaders(response: Response, env: Env): Response {
  if (env.ENVIRONMENT !== 'preview') return response;
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
