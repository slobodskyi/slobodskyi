import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { addressOf, frontmatterSchema, refFromPath } from '@slobodskyi/core';

// One collection over the whole content/ folder, validated by the shared core schema.
// Entry id = record address "<collection>/<id>:<lang>". Pages must filter with isPublished():
// private and draft records are loaded here but never rendered.
export const collections = {
  content: defineCollection({
    loader: glob({
      base: '../../content',
      pattern: ['**/*.{md,mdx}', '!inbox/**'],
      generateId: ({ entry }) => {
        const ref = refFromPath(entry);
        if (!ref.ok) throw new Error(`content/${entry}: ${ref.message}`);
        return addressOf(ref.ref);
      },
    }),
    schema: frontmatterSchema,
  }),
};
