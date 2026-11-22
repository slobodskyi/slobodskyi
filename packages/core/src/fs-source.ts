import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import type { ContentSource } from './source.ts';

/** Content source backed by the local filesystem (the repository's content/ folder). */
export class FsSource implements ContentSource {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private abs(path: string): string {
    const full = resolve(this.root, path);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error(`path escapes content root: ${path}`);
    }
    return full;
  }

  async list(): Promise<string[]> {
    const entries = await readdir(this.root, { recursive: true, withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && /\.mdx?$/.test(e.name))
      .map((e) => relative(this.root, resolve(e.parentPath, e.name)).split(sep).join('/'))
      .filter((p) => !p.startsWith('inbox/'))
      .sort();
  }

  async read(path: string): Promise<string> {
    return readFile(this.abs(path), 'utf8');
  }

  async write(path: string, raw: string): Promise<void> {
    const full = this.abs(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, raw, 'utf8');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await stat(this.abs(path));
      return true;
    } catch {
      return false;
    }
  }
}
