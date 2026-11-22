// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default tseslint.config(
  {
    ignores: [
      '.claude/worktrees/**',
      '**/dist/**',
      '**/.astro/**',
      '**/.wrangler/**',
      '**/node_modules/**',
      'data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...astro.configs.recommended,
  {
    files: ['scripts/**/*.{js,mjs,ts}', '.claude/hooks/**/*.{js,mjs}', '**/*.config.{js,mjs,ts}'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
);
