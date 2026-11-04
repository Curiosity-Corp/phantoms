import { afterAll, describe, expect, test } from 'bun:test';
import { createDatabase } from '../src/client';
import { createChunkStore, EMBEDDING_DIMENSIONS } from '../src/vector';

// Opt in with PGVECTOR_DATABASE_URL, a database where
// `bun run db:migrate:vector` has run (the `pgvector` Compose profile).
const url = Bun.env.PGVECTOR_DATABASE_URL;

if (!url) {
  test.skip('pgvector tests require PGVECTOR_DATABASE_URL', () => {});
} else {
  const { client, db } = createDatabase(url);
  const store = createChunkStore(db);
  const run = crypto.randomUUID();
  const source = (name: string) => `${run}-${name}`;

  /** A vector with the given weights at the first positions, zero elsewhere. */
  const vec = (...weights: number[]) => {
    const embedding = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    weights.forEach((weight, index) => {
      embedding[index] = weight;
    });
    return embedding;
  };

  describe('pgvector chunk store', () => {
    afterAll(async () => {
      await store.removeSource(source('a'));
      await store.removeSource(source('b'));
      await client.end({ timeout: 5 });
    });

    test('finds the closest chunks first', async () => {
      await store.upsert([
        {
          sourceId: source('a'),
          chunkIndex: 0,
          content: 'north',
          embedding: vec(1, 0, 0),
        },
        {
          sourceId: source('a'),
          chunkIndex: 1,
          content: 'east',
          embedding: vec(0, 1, 0),
        },
        {
          sourceId: source('b'),
          chunkIndex: 0,
          content: 'north-ish',
          embedding: vec(0.9, 0.1, 0),
        },
      ]);

      const found = await store.search(vec(1, 0, 0), { limit: 10 });
      const mine = found.filter((match) => match.sourceId.startsWith(run));
      expect(mine.map((match) => match.content)).toEqual([
        'north',
        'north-ish',
        'east',
      ]);
      expect(mine[0]?.similarity).toBeCloseTo(1, 5);
      expect(mine[2]?.similarity).toBeCloseTo(0, 5);
    });

    test('limits by source and by minimum similarity', async () => {
      const onlyB = await store.search(vec(1, 0, 0), { sourceId: source('b') });
      expect(onlyB.map((match) => match.content)).toEqual(['north-ish']);

      const close = await store.search(vec(1, 0, 0), {
        sourceId: source('a'),
        minSimilarity: 0.5,
      });
      expect(close.map((match) => match.content)).toEqual(['north']);
    });

    test('upsert replaces a chunk and removeSource deletes it', async () => {
      await store.upsert([
        {
          sourceId: source('a'),
          chunkIndex: 1,
          content: 'south',
          embedding: vec(0, 0, 1),
        },
      ]);
      const replaced = await store.search(vec(0, 0, 1), {
        sourceId: source('a'),
      });
      expect(replaced[0]?.content).toBe('south');
      expect(replaced).toHaveLength(2);

      await store.removeSource(source('a'));
      expect(
        await store.search(vec(1, 0, 0), { sourceId: source('a') }),
      ).toEqual([]);
    });
  });
}
