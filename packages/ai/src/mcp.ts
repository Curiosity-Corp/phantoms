import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { z } from 'zod';
import type { AIToolSet } from './types';
import { AIError } from './types';

const serverSchema = z.object({
  /** Short name; tools are exposed to the model as `<name>_<tool>`. */
  name: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  url: z
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
  /** Optional request headers, for example a bearer token. Keep server-side. */
  headers: z.record(z.string(), z.string()).optional(),
  /** Tool names, as the server names them, that may be exposed. Required. */
  allowedTools: z.array(z.string().min(1).max(64)).min(1).max(32),
});

export const mcpConfigSchema = z
  .object({
    /** Off unless explicitly enabled. */
    enabled: z.boolean().default(false),
    /** Time allowed to connect and list tools, per server. */
    connectTimeoutMs: z.number().int().min(500).max(30_000).default(5_000),
    servers: z
      .array(serverSchema)
      .max(8)
      .default([])
      .refine(
        (servers) =>
          new Set(servers.map((s) => s.name)).size === servers.length,
        'Server names must be unique.',
      ),
  })
  .default({ enabled: false, connectTimeoutMs: 5_000, servers: [] });

export type MCPConfig = NonNullable<z.input<typeof mcpConfigSchema>>;

type Env = Record<string, string | undefined>;

/**
 * Read AI_MCP_ENABLED (default off) and AI_MCP_SERVERS (a JSON array). The
 * servers come only from server-side configuration, never from a request.
 */
export function mcpConfigFromEnv(env: Env = process.env): MCPConfig {
  const raw = env.AI_MCP_SERVERS?.trim();
  let servers: unknown = [];
  if (raw) {
    try {
      servers = JSON.parse(raw);
    } catch {
      throw new Error('AI_MCP_SERVERS must be a JSON array.');
    }
  }
  return {
    enabled: env.AI_MCP_ENABLED?.trim().toLowerCase() === 'true',
    servers: servers as MCPConfig['servers'],
  };
}

/** The part of the AI SDK's MCP client this wiring uses (injectable in tests). */
export type MCPClientLike = Pick<
  MCPClient,
  'listTools' | 'toolsFromDefinitions' | 'close'
>;

export type MCPToolsOptions = {
  /** Replace the client factory, for tests. */
  createClient?: (server: {
    url: string;
    headers?: Record<string, string>;
  }) => Promise<MCPClientLike>;
};

export type MCPTools = {
  /** Allowlisted tools, ready to pass as `tools` to `createAIClient`. */
  tools: AIToolSet;
  /** Allowlisted names a server did not offer. */
  missing: string[];
  /** Close every connection. Call it when the app shuts down. */
  close(): Promise<void>;
};

const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new AIError('timeout', 'Connecting to an MCP server timed out.'));
    }, ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/**
 * Connect to the MCP servers listed in server-side config and expose only the
 * allowlisted tools. Does nothing, and opens no connection, unless
 * `enabled` is true. MCP tool output is untrusted input to the model.
 */
export async function connectMCPTools(
  input: MCPConfig | undefined,
  options: MCPToolsOptions = {},
): Promise<MCPTools> {
  const config = mcpConfigSchema.parse(input);
  const tools: AIToolSet = {};
  const missing: string[] = [];
  const clients: MCPClientLike[] = [];
  const close = async () => {
    await Promise.allSettled(clients.splice(0).map((client) => client.close()));
  };
  if (!config.enabled) return { tools, missing, close };

  const create =
    options.createClient ??
    (({ url, headers }) =>
      createMCPClient({
        transport: {
          type: 'http',
          url,
          ...(headers ? { headers } : {}),
          redirect: 'error',
        },
      }));

  try {
    for (const server of config.servers) {
      let client: MCPClientLike | undefined;
      const connect = async () => {
        client = await create({
          url: server.url,
          ...(server.headers ? { headers: server.headers } : {}),
        });
        clients.push(client);
        const listed = await client.listTools();
        const allowed = new Set(server.allowedTools);
        const offered = new Set(listed.tools.map((tool) => tool.name));
        missing.push(
          ...server.allowedTools
            .filter((name) => !offered.has(name))
            .map((name) => `${server.name}_${name}`),
        );
        return client.toolsFromDefinitions({
          ...listed,
          tools: listed.tools.filter((tool) => allowed.has(tool.name)),
        });
      };
      const exposed = await withTimeout(
        connect(),
        config.connectTimeoutMs,
        () => void client?.close(),
      );
      for (const [name, tool] of Object.entries(exposed)) {
        if (!server.allowedTools.includes(name)) continue;
        const exposedName = `${server.name}_${name}`;
        if (!TOOL_NAME.test(exposedName)) {
          throw new AIError(
            'invalid_request',
            `Unusable MCP tool name: ${exposedName}`,
          );
        }
        tools[exposedName] = tool;
      }
    }
  } catch (error) {
    await close();
    throw error;
  }
  return { tools, missing, close };
}
