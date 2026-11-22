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
    // Small per-page CSS stays inline: one request less on the critical path.
    inlineStylesheets: 'auto',
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  // Unbounded (headings), self-hosted: downloaded at build time and served from /_astro.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Unbounded',
      cssVariable: '--font-heading',
      weights: [500, 600, 700],
      styles: ['normal'],
      subsets: ['latin', 'cyrillic'],
      fallbacks: ['Arial', 'sans-serif'],
    },
  ],
  integrations: [mdx()],
});
