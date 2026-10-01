import { desc, eq, sql } from 'drizzle-orm';
import type { AppDatabase } from './client';
import { type Task, tasks } from './schema';

export function createTaskStore(db: AppDatabase) {
  return {
    async list(): Promise<Task[]> {
      return db.select().from(tasks).orderBy(desc(tasks.createdAt)).limit(100);
    },
    async create(title: string): Promise<Task> {
      const [item] = await db.insert(tasks).values({ title }).returning();
      if (!item) {
        throw new Error('The database did not return the created task.');
      }
      return item;
    },
    async remove(id: string): Promise<void> {
      await db.delete(tasks).where(eq(tasks.id, id));
    },
    async check(): Promise<void> {
      await db.execute(sql`select 1`);
    },
  };
}
