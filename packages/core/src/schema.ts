import { z } from 'zod';
import { HUBS } from './constants.ts';

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase latin letters, digits and single hyphens');

/** A path on this site: "/" or "/a/b", no trailing slash. */
export const sitePathSchema = z
  .string()
  .regex(/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/, 'use a site path like /a/b without a trailing slash');

/** Old path that must 301 to the record's current URL. Looser than sitePath: legacy paths may be odd. */
export const legacyPathSchema = z
  .string()
  .regex(/^\/[^\s?#]*$/, 'use a path starting with /, without query or hash')
  .refine((p) => p === '/' || !p.endsWith('/'), 'no trailing slash');

/**
 * Calendar date as "YYYY-MM-DD". Accepts a Date too, because Astro's YAML parser turns unquoted
 * dates into Date objects, while core's parser keeps them as strings. Output is always a string.
 */
export const isoDateSchema = z.union([z.iso.date(), z.date().transform((d) => d.toISOString().slice(0, 10))]);

/** Reference to another record regardless of language: "<collection>/<id>". */
export const recordRefSchema = z
  .string()
  .regex(/^[a-z]+\/[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use "<collection>/<id>"');

const faqSchema = z.array(z.object({ q: z.string().trim().min(1), a: z.string().trim().min(1) }).strict());

const common = {
  /** Visible H1. */
  title: z.string().trim().min(1),
  /** Meta description. Required for published public records (checked by validate). */
  description: z.string().trim().min(1).optional(),
  /** <title> when it differs from the H1. */
  seoTitle: z.string().trim().min(1).optional(),
  /** Intro paragraph under the H1. */
  lead: z.string().trim().min(1).optional(),
  /** Cover image, path relative to the record folder. */
  cover: z.string().min(1).optional(),
  coverAlt: z.string().optional(),
  stage: z.enum(['seedling', 'budding', 'evergreen']).default('seedling'),
  /** private never reaches the build; circle is reserved for members-only content. */
  visibility: z.enum(['private', 'circle', 'public']),
  status: z.enum(['inbox', 'draft', 'review', 'scheduled', 'published', 'archived']),
  created: isoDateSchema,
  updated: isoDateSchema,
  reviewed: isoDateSchema.optional(),
  /** Required when status is "scheduled". */
  publishAt: isoDateSchema.optional(),
  /** Previous paths of this record (with language prefix). Each becomes a 301 to the current URL. */
  legacyUrls: z.array(legacyPathSchema).default([]),
  related: z.array(recordRefSchema).default([]),
  ai: z
    .object({ assisted: z.boolean().default(false), source: z.string().optional() })
    .strict()
    .default({ assisted: false }),
};

const hub = z.enum(HUBS);

export const guideSchema = z
  .object({
    type: z.literal('guide'),
    ...common,
    hub,
    category: slugSchema,
    slug: slugSchema,
    faq: faqSchema.default([]),
  })
  .strict();

export const hubSchema = z.object({ type: z.literal('hub'), ...common, hub }).strict();

export const categorySchema = z
  .object({ type: z.literal('category'), ...common, hub, category: slugSchema })
  .strict();

/** Service pages (about, contacts, courses/…, home = "/"). URL = language prefix + path. */
export const pageSchema = z
  .object({ type: z.literal('page'), ...common, path: sitePathSchema, faq: faqSchema.default([]) })
  .strict();

export const nowSchema = z.object({ type: z.literal('now'), ...common, path: sitePathSchema }).strict();

const simple = <T extends string>(type: T) =>
  z.object({ type: z.literal(type), ...common, slug: slugSchema }).strict();

export const essaySchema = simple('essay');
export const logSchema = simple('log');
export const tilSchema = simple('til');
export const noteSchema = simple('note');
export const projectSchema = simple('project');
export const linksSchema = z
  .object({ type: z.literal('links'), ...common, slug: slugSchema, href: z.url().optional() })
  .strict();

export const frontmatterSchema = z.discriminatedUnion('type', [
  guideSchema,
  hubSchema,
  categorySchema,
  pageSchema,
  nowSchema,
  essaySchema,
  logSchema,
  tilSchema,
  noteSchema,
  projectSchema,
  linksSchema,
]);

export type Frontmatter = z.output<typeof frontmatterSchema>;
export type FrontmatterInput = z.input<typeof frontmatterSchema>;

/** Published and public: the only records that reach the build. */
export const isPublished = (fm: Pick<Frontmatter, 'status' | 'visibility'>): boolean =>
  fm.status === 'published' && fm.visibility === 'public';

/** JSON Schema of the frontmatter, for editors, plugins and MCP clients. */
export function frontmatterJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(frontmatterSchema, {
    io: 'input',
    unrepresentable: 'any',
    override: (ctx) => {
      // Dates are written as "YYYY-MM-DD" strings in files; the Date branch exists only for Astro.
      if (ctx.zodSchema._zod.def.type === 'date') {
        ctx.jsonSchema.type = 'string';
        ctx.jsonSchema.format = 'date';
      }
    },
  });
}
