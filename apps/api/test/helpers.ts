import type { Task } from '@phantoms/db';
import type { TaskStore } from '../src/app';
import { createLogger } from '../src/logger';

export function makeStore(overrides: Partial<TaskStore> = {}): TaskStore {
  const items: Task[] = [];
  return {
    async list() {
      return items;
    },
    async create(title) {
      const item: Task = {
        id: crypto.randomUUID(),
        title,
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
      };
      items.push(item);
      return item;
    },
    async remove(id) {
      const index = items.findIndex((item) => item.id === id);
      if (index !== -1) items.splice(index, 1);
    },
    async check() {},
    ...overrides,
  };
}

/** A logger that keeps its lines so a test can read them back. */
export function captureLogger(level: 'debug' | 'info' = 'info') {
  const lines: string[] = [];
  const logger = createLogger({
    level,
    write: (line) => lines.push(line),
    now: () => new Date('2026-11-03T12:00:00.000Z'),
  });
  return {
    logger,
    lines,
    records: () =>
      lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}
