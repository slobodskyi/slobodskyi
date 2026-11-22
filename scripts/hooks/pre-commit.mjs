// Pre-commit guard. Blocks:
//  1. content files with `visibility: private` anywhere (the repository is or was public)
//  2. secret files (.env, .dev.vars, …)
// Reads the *staged* version of each file, not the working tree.
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean);

const SECRET = /(^|\/)(\.env(\..*)?|\.dev\.vars)$/;
const CONTENT = /\.(md|mdx)$/;
const PRIVATE = /^visibility:\s*["']?private["']?\s*$/m;

const problems = [];

for (const file of staged) {
  if (SECRET.test(file) && !file.endsWith('.env.example')) {
    problems.push(`${file}: secret file must not be committed`);
    continue;
  }
  if (!CONTENT.test(file)) continue;

  const text = git('show', `:${file}`);
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (frontmatter && PRIVATE.test(frontmatter)) {
    problems.push(`${file}: visibility: private must not be committed (the repository is or was public)`);
  }
}

if (problems.length) {
  console.error('pre-commit blocked:\n  ' + problems.join('\n  '));
  process.exit(1);
}
