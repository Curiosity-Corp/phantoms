import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export type TaskView = { id: string; title: string; createdAt: Date };

// The only thing the tools can reach: a read-only view of tasks. There is no
// create or delete here, so no tool can change data even if a model asks.
export type TaskReader = { list: () => Promise<TaskView[]> };

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function present(task: TaskView) {
  return {
    id: task.id,
    title: task.title,
    createdAt: task.createdAt.toISOString(),
  };
}

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

// A new server per request keeps the endpoint stateless: no session to steal
// or to leak between callers.
export function createTaskServer(tasks: TaskReader): McpServer {
  const server = new McpServer({ name: 'phantoms-tasks', version: '0.1.0' });

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description: 'List the most recent tasks, newest first. Read-only.',
      inputSchema: { limit: z.number().int().min(1).max(50).default(20) },
      annotations: readOnly,
    },
    async ({ limit }) => {
      const items = (await tasks.list()).slice(0, limit).map(present);
      return json({ items });
    },
  );

  server.registerTool(
    'get_task',
    {
      title: 'Get a task',
      description: 'Get one task by its id. Read-only.',
      inputSchema: { id: z.uuid() },
      annotations: readOnly,
    },
    async ({ id }) => {
      const task = (await tasks.list()).find((item) => item.id === id);
      if (!task) {
        return { ...json({ error: 'Task not found.' }), isError: true };
      }
      return json({ item: present(task) });
    },
  );

  return server;
}
