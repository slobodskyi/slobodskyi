// Download every file hosted on the Webflow CDN (Step 3) so nothing depends on it after Webflow is
// cancelled.
//
//   pnpm webflow:media
//
// Sources: Webflow assets list, CMS items (image fields and rich text), static page DOM, the HTML
// snapshot (data/legacy/pages.json) and the site's CSS (background images). Responsive srcset
// variants ("…-p-500.webp") are not downloaded: they map to their original, Astro makes its own.
// Files referenced by the live site, its CSS, any CMS item (drafts too) or a static page go to
// data/legacy/media/ (committed). Files only present in the Webflow asset manager go to
// data/legacy/media-archive/ (git-ignored raw backup, destined for R2).
// Re-runs reuse files already on disk.
// Writes:
//   data/legacy/media/<bucket>/<file>   originals in use
//   data/legacy/media-archive/…         unused originals
//   data/legacy/site/css/<file>.css     site stylesheets (design reference)
//   data/legacy/media-map.json          old URL → local file (+ bytes, sha256, type, variantOf)
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { findCdnUrls, normalizeCdnUrl } from '../lib/cdn.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const LEGACY = join(ROOT, 'data', 'legacy');
const EXPORT = join(LEGACY, 'webflow-export');
const MEDIA_DIR = join(LEGACY, 'media');
const CONCURRENCY = 6;

const VARIANT = /-p-\d+(\.\w+)$/;
const SKIP = /\.(js|json)$/i;

interface MapEntry {
  file: string | null;
  /** Referenced by the live site, CSS, a CMS item or a static page (false: asset manager only). */
  used: boolean;
  bytes?: number;
  sha256?: string;
  contentType?: string;
  variantOf?: string;
  error?: string;
}

function collect(text: string, into: Set<string>): void {
  for (const url of findCdnUrls(text)) into.add(url);
}

async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

/** data/legacy/media/<bucket>/<decoded file name>; keeps Webflow's unique id prefix. */
function localPath(url: string, used: boolean): string {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  const bucket = parts.length > 1 ? parts[0] : 'root';
  const name = decodeURIComponent(parts.slice(parts.length > 1 ? 1 : 0).join('_')).replace(
    /[^\p{L}\p{N}._-]+/gu,
    '-',
  );
  return `${used ? 'media' : 'media-archive'}/${bucket}/${name}`;
}

async function download(url: string, target: string): Promise<Omit<MapEntry, 'file' | 'used'>> {
  try {
    const data = await readFile(target);
    return {
      bytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
      contentType: 'cached',
    };
  } catch {
    // not downloaded yet
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) {
        if (res.status >= 500 && attempt < 3) continue;
        return { error: `HTTP ${res.status}` };
      }
      const data = Buffer.from(await res.arrayBuffer());
      if (data.length === 0) return { error: 'empty response' };
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
      return {
        bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
        contentType: res.headers.get('content-type') ?? '',
      };
    } catch (error) {
      if (attempt >= 3) return { error: (error as Error).message };
    }
  }
}

async function main(): Promise<void> {
  const found = new Set<string>();
  const assetManager = new Set<string>();
  for (const a of JSON.parse(await readText(join(EXPORT, 'assets.json'))) as { hostedUrl?: string }[]) {
    if (a.hostedUrl) assetManager.add(normalizeCdnUrl(a.hostedUrl));
  }
  for (const dir of ['collections', 'pages-dom']) {
    for (const name of await readdir(join(EXPORT, dir)))
      collect(await readText(join(EXPORT, dir, name)), found);
  }
  collect(await readText(join(EXPORT, 'pages.json')), found);
  collect(await readText(join(LEGACY, 'pages.json')), found);

  // Stylesheets: keep a copy and harvest url(...) references.
  const css = [...found].filter((u) => u.endsWith('.css'));
  for (const url of css) {
    const text = await (await fetch(url)).text();
    const name = url.split('/').pop() ?? 'site.css';
    await mkdir(join(LEGACY, 'site', 'css'), { recursive: true });
    await writeFile(join(LEGACY, 'site', 'css', name), text, 'utf8');
    collect(text, found);
    found.delete(url);
  }

  // Everything collected so far is referenced somewhere real; asset-manager-only files are unused.
  const used = new Set(found);
  assetManager.forEach((u) => found.add(u));
  const urls = [...found].filter((u) => !SKIP.test(u)).sort();
  const originals = new Set(urls.filter((u) => !VARIANT.test(u)));
  const map: Record<string, MapEntry> = {};
  // Map srcset variants to their original; a used variant makes its original used.
  const variantOf = new Map<string, string>();
  for (const url of urls) {
    const m = VARIANT.exec(url);
    const base = m ? url.replace(VARIANT, '') : null;
    const original = base ? [...originals].find((o) => o.replace(/\.\w+$/, '') === base) : undefined;
    if (!original) continue;
    variantOf.set(url, original);
    if (used.has(url)) used.add(original);
  }
  const toDownload: string[] = [];
  for (const url of urls) {
    const original = variantOf.get(url);
    if (original) {
      map[url] = { file: localPath(original, used.has(original)), used: used.has(url), variantOf: original };
    } else toDownload.push(url);
  }

  let done = 0;
  const queue = [...toDownload];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        const isUsed = used.has(url);
        const file = localPath(url, isUsed);
        const result = await download(url, join(LEGACY, file));
        map[url] = result.error ? { file: null, used: isUsed, ...result } : { file, used: isUsed, ...result };
        process.stdout.write(`\r${++done}/${toDownload.length} downloaded`);
      }
    }),
  );
  process.stdout.write('\n');

  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(join(LEGACY, 'media-map.json'), JSON.stringify(sorted, null, 2) + '\n', 'utf8');

  const entries = Object.values(sorted);
  const downloaded = entries.filter((e) => e.sha256);
  const byExt: Record<string, { files: number; mb: number }> = {};
  for (const e of downloaded) {
    const ext = (e.file ?? '').split('.').pop()?.toLowerCase() ?? '?';
    byExt[ext] ??= { files: 0, mb: 0 };
    byExt[ext].files++;
    byExt[ext].mb = Math.round((byExt[ext].mb + (e.bytes ?? 0) / 1e6) * 10) / 10;
  }
  console.log(
    JSON.stringify(
      {
        urls: entries.length,
        downloaded: downloaded.length,
        variantsMapped: entries.filter((e) => e.variantOf).length,
        totalMb: Math.round(downloaded.reduce((s, e) => s + (e.bytes ?? 0), 0) / 1e5) / 10,
        byExt,
        stylesheets: css.length,
        inUse: {
          files: downloaded.filter((e) => e.used).length,
          mb: Math.round(downloaded.filter((e) => e.used).reduce((s, e) => s + (e.bytes ?? 0), 0) / 1e5) / 10,
        },
        archived: {
          files: downloaded.filter((e) => !e.used).length,
          mb:
            Math.round(downloaded.filter((e) => !e.used).reduce((s, e) => s + (e.bytes ?? 0), 0) / 1e5) / 10,
        },
        failed: Object.entries(sorted)
          .filter(([, e]) => e.error)
          .map(([u, e]) => `${u} (${e.error})`),
      },
      null,
      2,
    ),
  );
}

await main();
