// Keeps AGENTS.md from rotting. Fails when:
//  - AGENTS.md or CLAUDE.md is missing, or CLAUDE.md does not import AGENTS.md
//  - AGENTS.md is over the size budget
//  - a `bun run <script>` in the Commands block is not defined in package.json
//  - a relative link in AGENTS.md, the nested AGENTS.md files or docs/agents/ does not resolve
// Run with: bun run check:agents

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const MAX_LINES = 120;
const MAX_BYTES = 8_000;
const NESTED = [
  'apps/api/AGENTS.md',
  'packages/db/AGENTS.md',
  'packages/ai/AGENTS.md',
];

const errors: string[] = [];
const fail = (message: string) => errors.push(message);

function read(path: string): string | undefined {
  if (!existsSync(path)) {
    fail(`${path} is missing`);
    return undefined;
  }
  return readFileSync(path, 'utf8');
}

const agents = read('AGENTS.md');
const claude = read('CLAUDE.md');
for (const path of NESTED) read(path);

if (claude && !/^@AGENTS\.md\s*$/m.test(claude)) {
  fail('CLAUDE.md must import AGENTS.md with a line containing @AGENTS.md');
}

if (agents) {
  const lines = agents.split('\n').length;
  if (lines > MAX_LINES)
    fail(`AGENTS.md has ${lines} lines (budget ${MAX_LINES})`);
  const bytes = Buffer.byteLength(agents);
  if (bytes > MAX_BYTES)
    fail(`AGENTS.md is ${bytes} bytes (budget ${MAX_BYTES})`);

  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const block = /## Commands[\s\S]*?```sh\n([\s\S]*?)```/.exec(agents);
  if (!block) {
    fail('AGENTS.md needs a "## Commands" section with a ```sh block');
  } else {
    for (const line of block[1].split('\n')) {
      const command = line.split('#')[0].trim();
      if (!command) continue;
      const run = /^bun run (\S+)/.exec(command);
      if (run && !pkg.scripts?.[run[1]]) {
        fail(
          `Commands block uses "bun run ${run[1]}" but package.json has no such script`,
        );
      }
      const test = /^bun test (\S+\.ts)/.exec(command);
      if (test && !existsSync(test[1])) {
        fail(
          `Commands block names the test file ${test[1]}, which does not exist`,
        );
      }
    }
  }
}

function markdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? markdownFiles(join(dir, entry.name))
      : entry.name.endsWith('.md')
        ? [join(dir, entry.name)]
        : [],
  );
}

const linkChecked = ['AGENTS.md', ...NESTED, ...markdownFiles('docs/agents')];
for (const file of linkChecked) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    if (!existsSync(join(dirname(file), target))) {
      fail(`${file} links to ${match[1]}, which does not exist`);
    }
  }
}

if (errors.length > 0) {
  console.error('Agent instruction check failed:');
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}
console.log('Agent instruction check passed.');
