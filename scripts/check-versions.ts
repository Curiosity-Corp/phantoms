// Fails when docs/version-policy.md quotes a version that differs from the
// manifests, or when Bun versions disagree between package.json, the
// Dockerfile, CONTRIBUTING.md, README.md and docs/getting-started.md.
// Run with: bun run check:versions

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const errors: string[] = [];

type Manifest = {
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const manifests = [
  'package.json',
  ...['apps', 'packages'].flatMap((dir) =>
    existsSync(dir)
      ? readdirSync(dir)
          .map((name) => join(dir, name, 'package.json'))
          .filter((path) => existsSync(path))
      : [],
  ),
].map((path) => JSON.parse(readFileSync(path, 'utf8')) as Manifest);

const versions = new Map<string, Set<string>>();
for (const manifest of manifests) {
  const all = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const [name, version] of Object.entries(all)) {
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name)?.add(version);
  }
}

const rootManifest = manifests[0];
const bun = /^bun@(.+)$/.exec(rootManifest.packageManager ?? '')?.[1];
if (!bun) errors.push('package.json needs "packageManager": "bun@<version>"');

// Table row label in docs/version-policy.md -> package names that must match.
const rows: Record<string, string[]> = {
  Turborepo: ['turbo'],
  'Next.js': ['next'],
  'React / React DOM': ['react', 'react-dom'],
  '`@types/node`': ['@types/node'],
  Hono: ['hono'],
  'AI SDK': ['ai'],
  Biome: ['@biomejs/biome'],
  'Drizzle ORM': ['drizzle-orm'],
  'postgres.js': ['postgres'],
};

const policy = readFileSync('docs/version-policy.md', 'utf8');
for (const [label, names] of Object.entries(rows)) {
  const row = policy
    .split('\n')
    .find((line) => line.startsWith(`| ${label} |`));
  const quoted = row?.split('|')[2]?.trim();
  if (!quoted) {
    errors.push(`docs/version-policy.md has no row for ${label}`);
    continue;
  }
  for (const name of names) {
    const found = versions.get(name);
    const matches = found?.size === 1 && found.has(quoted);
    if (!matches) {
      errors.push(
        `${label}: docs/version-policy.md says ${quoted}, manifests say ${[...(found ?? [])].join(', ') || 'nothing'} for ${name}`,
      );
    }
  }
}

if (bun) {
  const bunRow = policy.split('\n').find((line) => line.startsWith('| Bun |'));
  if (bunRow?.split('|')[2]?.trim() !== bun) {
    errors.push(
      `Bun: docs/version-policy.md differs from packageManager ${bun}`,
    );
  }
  const places = [
    'Dockerfile',
    'CONTRIBUTING.md',
    'README.md',
    'docs/getting-started.md',
  ];
  for (const file of places) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(
      /\bBun (\d+\.\d+\.\d+)|oven\/bun:(\d+\.\d+\.\d+)/g,
    )) {
      const found = match[1] ?? match[2];
      if (found !== bun)
        errors.push(`${file} mentions Bun ${found}, packageManager is ${bun}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Version check failed:');
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}
console.log('Version check passed.');
