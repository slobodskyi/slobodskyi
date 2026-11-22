// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import mdx from '@astrojs/mdx';

// Static site. URLs must match the legacy Webflow site 1:1:
// no trailing slash, EN at the root, Ukrainian under /ua (hreflang "uk"), Russian under /ru.
// Every page comes from one catch-all route over the content collection (src/pages/[...path].astro),
// so Astro's i18n routing is not used.
export default defineConfig({
  site: 'https://slobodskyi.com',
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',
    // All CSS is inline (~14 KB): no render-blocking stylesheet requests on the critical path.
    inlineStylesheets: 'always',
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  // Unbounded (headings), self-hosted: downloaded at build time and served from /_astro.
  // One weight on purpose: Astro collects preload data only for the first weight of a variable
  // file, so a single weight keeps the preload working. Astro's generated fallback metrics were
  // ~30% too wide for Unbounded (headings re-wrapped on swap), so the metric-matched fallback
  // "Unbounded Fallback" is hand-measured in src/styles/global.css instead.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Unbounded',
      cssVariable: '--font-heading',
      weights: [600],
      styles: ['normal'],
      subsets: ['latin', 'cyrillic'],
      fallbacks: ['Unbounded Fallback', 'Arial', 'sans-serif'],
      optimizedFallbacks: false,
    },
  ],
  integrations: [mdx()],
});
