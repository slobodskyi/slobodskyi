// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// Static site. URLs must match the legacy Webflow site 1:1:
// no trailing slash, EN at the root, Ukrainian under /ua (hreflang "uk"), Russian under /ru.
export default defineConfig({
  site: 'https://slobodskyi.com',
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', { path: 'ua', codes: ['uk'] }, 'ru'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  integrations: [mdx()],
});
