// Minimal Webflow Data API v2 client: read-only GETs, throttled under the rate limit, retries on
// 429/5xx. Reads WEBFLOW_API_TOKEN and WEBFLOW_SITE_ID from the environment (run with --env-file=.env).
// The token is never logged.

const BASE = 'https://api.webflow.com/v2';
const MIN_INTERVAL_MS = 450; // ≈130 requests/min, under the 150/min site limit

export function credentials(): { token: string; siteId: string } {
  const token = process.env.WEBFLOW_API_TOKEN;
  const siteId = process.env.WEBFLOW_SITE_ID;
  if (!token || !siteId) {
    throw new Error('WEBFLOW_API_TOKEN and WEBFLOW_SITE_ID must be set in .env (see .env.example)');
  }
  return { token, siteId };
}

let last = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function get<T>(path: string): Promise<T> {
  const { token } = credentials();
  for (let attempt = 1; ; attempt++) {
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(BASE + path, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt;
      await sleep(retryAfter * 1000);
      continue;
    }
    const body = await res.text();
    throw new Error(`GET ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
}

interface Paginated {
  pagination?: { total: number; offset: number; limit: number };
}

/** Fetches every page of a paginated list. `key` is the array property (items, pages, assets, …). */
export async function getAll<T>(path: string, key: string, limit = 100): Promise<T[]> {
  const out: T[] = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let offset = 0; ; offset += limit) {
    const page = await get<Paginated & Record<string, unknown>>(
      `${path}${sep}limit=${limit}&offset=${offset}`,
    );
    const batch = (page[key] as T[] | undefined) ?? [];
    out.push(...batch);
    const total = page.pagination?.total ?? out.length;
    if (batch.length === 0 || out.length >= total) return out;
  }
}
