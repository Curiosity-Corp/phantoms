import { afterAll, describe, expect, test } from 'bun:test';
import { createDatabase, createTaskStore } from '@phantoms/db';

const databaseUrl = Bun.env.DATABASE_URL;

if (!databaseUrl) {
  test.skip('PostgreSQL integration tests require DATABASE_URL', () => {});
} else {
  const { client, db } = createDatabase(databaseUrl);
  const store = createTaskStore(db);

  describe('PostgreSQL task store', () => {
    afterAll(async () => {
      await client.end({ timeout: 5 });
    });

    test('checks readiness and persists a task', async () => {
      await store.check();
      const title = `integration-${crypto.randomUUID()}`;
      const created = await store.create(title);

      try {
        expect(created.title).toBe(title);
        const found = await store.list();
        expect(
          found.some((item) => item.id === created.id && item.title === title),
        ).toBe(true);
      } finally {
        await store.remove(created.id);
      }
    });
  });
}
