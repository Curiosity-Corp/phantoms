// This repository is mirrored publicly. Fails when a tracked file contains
// something that must not be public, or defines the A of PHANTOMS as one
// vendor. Run with: bun run check:public

import { readFileSync } from 'node:fs';

const SKIP = new Set(['bun.lock', 'scripts/check-public-tree.ts']);

const rules: { name: string; pattern: RegExp }[] = [
  {
    name: 'internal hostname (.internal, .local, .lan, .intranet, .corp)',
    pattern:
      /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(internal|local|lan|intranet|corp)\b/i,
  },
  {
    name: 'private or tailnet IP address',
    pattern:
      /\b(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01])|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\.\d{1,3}\.\d{1,3}\b/,
  },
  {
    name: 'internal infrastructure project or issue reference',
    pattern: /gitlab-k8s|FocusApiary/i,
  },
  {
    name: 'a vendor defined as the A of PHANTOMS',
    pattern:
      /\bA\s*(=|is|—|-)\s*Anthropic\b|\bAnthropic API\b|ANTHROPIC_API_KEY/,
  },
];

const files = new TextDecoder()
  .decode(Bun.spawnSync(['git', 'ls-files', '-z']).stdout)
  .split('\0')
  .filter((path) => path && !SKIP.has(path));

const problems: string[] = [];
for (const file of files) {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\0')) continue;
  text.split('\n').forEach((line, index) => {
    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        problems.push(`${file}:${index + 1}: ${rule.name}`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error('Public tree check failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`Public tree check passed (${files.length} files).`);
