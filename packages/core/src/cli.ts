// CLI over the core operations: `pnpm content <command> [options]`.
// Thin wrapper: all logic lives in the operations, so skills and the future MCP server get the
// same behaviour. With --json, prints one JSON document to stdout (for agents and scripts).
// Exit codes: 0 ok, 1 content problems, 2 usage error.
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  buildIndex,
  buildRedirects,
  create,
  frontmatterJsonSchema,
  isCollection,
  isLang,
  parseRedirectsCsv,
  validate,
  type Problem,
  type RecordType,
  type RedirectRule,
} from './index.ts';
import { FsSource } from './fs-source.ts';

const HELP = `Usage: pnpm content <command> [options]

Commands:
  validate                      Check all content (schema + cross-record rules)
  create <collection>/<id>:<lang> --title "…" [--field key=value …] [--type t] [--ext md|mdx]
                                Create a new record (status draft); never overwrites
  index [--out file] [--all]    Build content.json (published public records; --all adds drafts)
  redirects [--out file]        Build _redirects from legacyUrls + data/redirects/*.csv
  schema [--out file]           Print the frontmatter JSON Schema

Options:
  --json        Machine-readable output
  --root dir    Repository root (default: nearest folder with pnpm-workspace.yaml)`;

function findRoot(start: string): string {
  let dir = resolve(start);
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('repository root not found (no pnpm-workspace.yaml)');
    dir = parent;
  }
  return dir;
}

/** "a=b" pairs → object; values parsed as JSON when possible ("[]", "true", "3"), else strings. */
function parseFields(pairs: string[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq < 1) throw new UsageError(`--field expects key=value, got "${pair}"`);
    const raw = pair.slice(eq + 1);
    let value: unknown = raw;
    if (/^[[{]|^(true|false|null|-?\d+(\.\d+)?)$/.test(raw)) {
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
    }
    fields[pair.slice(0, eq)] = value;
  }
  return fields;
}

class UsageError extends Error {}

function printProblems(problems: Problem[]): void {
  for (const p of problems) {
    const where = p.path ?? p.address ?? '';
    console.log(`${p.level === 'error' ? '✗' : '!'} ${where ? where + ': ' : ''}${p.message} [${p.code}]`);
  }
}

async function output(data: string, out: string | undefined, root: string): Promise<void> {
  if (!out) {
    process.stdout.write(data);
    return;
  }
  const file = resolve(root, out);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data, 'utf8');
}

async function loadStaticRules(root: string): Promise<{ rules: RedirectRule[]; problems: Problem[] }> {
  const dir = join(root, 'data', 'redirects');
  const rules: RedirectRule[] = [];
  const problems: Problem[] = [];
  if (!existsSync(dir)) return { rules, problems };
  for (const name of (await readdir(dir)).filter((n) => n.endsWith('.csv')).sort()) {
    const parsed = parseRedirectsCsv(await readFile(join(dir, name), 'utf8'), `data/redirects/${name}`);
    rules.push(...parsed.rules);
    problems.push(...parsed.problems);
  }
  return { rules, problems };
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      root: { type: 'string' },
      out: { type: 'string' },
      all: { type: 'boolean', default: false },
      title: { type: 'string' },
      description: { type: 'string' },
      type: { type: 'string' },
      ext: { type: 'string' },
      field: { type: 'string', multiple: true, default: [] },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (!command || values.help) {
    console.log(HELP);
    return command ? 0 : 2;
  }

  const root = findRoot(values.root ?? process.cwd());
  const source = new FsSource(join(root, 'content'));
  const json = values.json;
  const emit = (result: unknown) => console.log(JSON.stringify(result, null, 2));

  switch (command) {
    case 'validate': {
      const result = await validate(source);
      if (json) emit(result);
      else {
        printProblems([...result.errors, ...result.warnings]);
        console.log(
          `${result.ok ? '✓' : '✗'} ${result.records} records (${result.published} published), ` +
            `${result.errors.length} errors, ${result.warnings.length} warnings`,
        );
      }
      return result.ok ? 0 : 1;
    }

    case 'create': {
      const target = rest[0] ?? '';
      const m = /^([a-z]+)\/([^:]+):([a-z]+)$/.exec(target);
      if (!m) throw new UsageError('create expects <collection>/<id>:<lang>, e.g. guides/payoneer:en');
      const [, collection = '', id = '', lang = ''] = m;
      if (!isCollection(collection)) throw new UsageError(`unknown collection "${collection}"`);
      if (!isLang(lang)) throw new UsageError(`unknown language "${lang}"`);
      if (values.ext && values.ext !== 'md' && values.ext !== 'mdx')
        throw new UsageError('--ext is md or mdx');
      const fields = parseFields(values.field);
      if (values.title) fields.title = values.title;
      if (values.description) fields.description = values.description;
      const result = await create(source, {
        collection,
        id,
        lang,
        fields,
        ...(values.type ? { type: values.type as RecordType } : {}),
        ...(values.ext ? { ext: values.ext as 'md' | 'mdx' } : {}),
      });
      if (json) emit(result);
      else if (result.ok) console.log(`✓ created content/${result.path} → ${result.url}`);
      else printProblems(result.problems);
      return result.ok ? 0 : 1;
    }

    case 'index': {
      const { index, problems } = await buildIndex(source, { includeUnpublished: values.all });
      const text = JSON.stringify(index, null, 2) + '\n';
      if (values.out) await output(text, values.out, root);
      if (json && values.out)
        emit({ ok: problems.length === 0, entries: index.entries.length, out: values.out, problems });
      else if (!values.out) process.stdout.write(text);
      else {
        printProblems(problems);
        console.log(`✓ ${index.entries.length} entries → ${values.out}`);
      }
      return problems.some((p) => p.level === 'error') ? 1 : 0;
    }

    case 'redirects': {
      const statics = await loadStaticRules(root);
      const result = await buildRedirects(source, statics.rules);
      result.problems.unshift(...statics.problems);
      const ok = !result.problems.some((p) => p.level === 'error');
      if (values.out && ok) await output(result.file, values.out, root);
      if (json) emit({ ...result, ok });
      else if (!values.out) {
        printProblems(result.problems);
        process.stdout.write(result.file);
      } else {
        printProblems(result.problems);
        console.log(ok ? `✓ ${result.rules.length} rules → ${values.out}` : '✗ not written');
      }
      return ok ? 0 : 1;
    }

    case 'schema': {
      await output(JSON.stringify(frontmatterJsonSchema(), null, 2) + '\n', values.out, root);
      return 0;
    }

    default:
      throw new UsageError(`unknown command "${command}"\n\n${HELP}`);
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof UsageError || (error as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
      console.error((error as Error).message);
      process.exit(2);
    }
    console.error(error);
    process.exit(1);
  },
);
