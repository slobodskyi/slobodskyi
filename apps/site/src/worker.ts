/// <reference types="@cloudflare/workers-types" />
// Worker entry. Static pages are served from `dist` by Workers static assets; this code runs first
// for every path except hashed build assets (`run_worker_first` in wrangler.jsonc): trailing-slash
// 301s, /api/*, markdown negotiation and, on the preview, noindex headers.

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

    if (wantsMarkdown(request) && !/\.[a-z0-9]+$/i.test(url.pathname)) {
      const markdown = await markdownFor(url, request, env);
      if (markdown) return withPreviewHeaders(markdown, env);
    }

    const response = await env.ASSETS.fetch(request);
    if (!response.headers.get('Content-Type')?.startsWith('text/html')) {
      return withPreviewHeaders(response, env);
    }
    const headers = new Headers(response.headers);
    headers.append('Vary', 'Accept');
    return withPreviewHeaders(
      new Response(response.body, { status: response.status, statusText: response.statusText, headers }),
      env,
    );
  },
} satisfies ExportedHandler<Env>;

// Markdown for agents: `Accept: text/markdown` gets the page's <url>.md copy (home pages: llms.txt).
const HOMES = new Set(['/', '/ua', '/ru']);

function wantsMarkdown(request: Request): boolean {
  const accept = request.headers.get('Accept') ?? '';
  return accept.split(',').some((part) => {
    const [type, ...params] = part.trim().toLowerCase().split(';');
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    return type?.trim() === 'text/markdown' && (q === undefined || Number(q.slice(2)) > 0);
  });
}

async function markdownFor(url: URL, request: Request, env: Env): Promise<Response | undefined> {
  const source = new URL(HOMES.has(url.pathname) ? '/llms.txt' : `${url.pathname}.md`, url);
  const asset = await env.ASSETS.fetch(new Request(source));
  if (!asset.ok) return undefined;
  const text = await asset.text();
  return new Response(request.method === 'HEAD' ? null : text, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Vary: 'Accept',
      'X-Markdown-Tokens': String(Math.ceil(text.length / 4)),
      'Content-Location': source.pathname,
    },
  });
}

function withPreviewHeaders(response: Response, env: Env): Response {
  if (env.ENVIRONMENT !== 'preview') return response;
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
