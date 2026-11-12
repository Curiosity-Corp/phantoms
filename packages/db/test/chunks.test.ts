import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase } from '../src/client';
import { createChunkStore, EMBEDDING_DIMENSIONS } from '../src/vector';

// These tests need no database. The postgres.js client connects lazily, and
// every case below fails (or returns) before a query would be sent.
const { client, db } = createDatabase(
  'postgres://nobody:none@127.0.0.1:1/none',
);
const store = createChunkStore(db);
const zeros = () => new Array<number>(EMBEDDING_DIMENSIONS).fill(0);

describe('chunk store input checks', () => {
  test('rejects an embedding of the wrong size', async () => {
    await expect(store.search([1, 2, 3])).rejects.toThrow(
      /Expected an embedding/,
    );
    await expect(
      store.upsert([
        { sourceId: 's', chunkIndex: 0, content: 'x', embedding: [1] },
      ]),
    ).rejects.toThrow(/Expected an embedding/);
  });

  test('rejects non-finite numbers', async () => {
    const embedding = zeros();
    embedding[0] = Number.NaN;
    await expect(store.search(embedding)).rejects.toThrow(/finite/);
  });

  test('upserting nothing does not touch the database', async () => {
    await store.upsert([]);
    await client.end({ timeout: 1 });
  });
});

describe('migration separation', () => {
  const root = join(import.meta.dir, '..');
  const sql = (dir: string) =>
    readdirSync(join(root, dir))
      .filter((name) => name.endsWith('.sql'))
      .map((name) => readFileSync(join(root, dir, name), 'utf8'));

  test('the default migrations never need pgvector', () => {
    for (const migration of sql('drizzle')) {
      expect(migration).not.toMatch(/vector/i);
    }
  });

  test('the pgvector migration creates the extension first', () => {
    const [first] = sql('drizzle-vector');
    expect(first).toMatch(/CREATE EXTENSION IF NOT EXISTS vector;/);
    expect(first?.indexOf('CREATE EXTENSION')).toBeLessThan(
      first?.indexOf('CREATE TABLE') ?? 0,
    );
  });
});
