// Public API of @slobodskyi/core. Runtime-agnostic: no filesystem access here
// (use `@slobodskyi/core/fs` for FsSource in Node).
export * from './constants.ts';
export * from './schema.ts';
export * from './url.ts';
export * from './anchor.ts';
export * from './markdown.ts';
export * from './frontmatter.ts';
export * from './source.ts';
export { loadRecords, type LoadedRecord, type LoadResult, type Problem } from './ops/load.ts';
export { validate, type ValidateResult } from './ops/validate.ts';
export { create, type CreateInput, type CreateResult } from './ops/create.ts';
export { buildIndex, sha256, type ContentIndex, type IndexEntry } from './ops/build-index.ts';
export {
  buildRedirects,
  parseRedirectsCsv,
  type RedirectRule,
  type RedirectsResult,
} from './ops/build-redirects.ts';
