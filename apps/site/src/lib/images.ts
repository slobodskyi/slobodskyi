// Images that live next to content records (content/<collection>/<id>/<file>). MDX and frontmatter
// reference them by a relative string ("./file.webp"); this resolves that string to an
// astro:assets ImageMetadata so it gets optimised, hashed and served with srcset.
import type { ImageMetadata } from 'astro';

const files = import.meta.glob<ImageMetadata>(
  '../../../../content/**/*.{webp,png,jpg,jpeg,gif,avif,svg,WEBP,PNG,JPG,JPEG,GIF,AVIF,SVG}',
  { import: 'default' },
);

const PREFIX = '../../../../';

/** `dir` = record folder from the repository root ("content/guides/chatgpt"), `src` = "./x.webp". */
export async function resolveImage(dir: string, src: string): Promise<ImageMetadata> {
  const clean = src.replace(/^\.\//, '');
  const key = `${PREFIX}${dir}/${clean}`;
  const load = files[key];
  if (!load) throw new Error(`Image not found: ${dir}/${clean}`);
  return load();
}

/** Raster formats that astro:assets can re-encode; svg and gif (animation) are served as is. */
export const isOptimizable = (img: ImageMetadata): boolean => !['svg', 'gif'].includes(img.format);
