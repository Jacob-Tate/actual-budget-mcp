import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { actualClient } from '../../actual/client';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('@actual-app/api') as { getIDByName(type: string, name: string): Promise<string | null> };

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function fail(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('[lookup tool error]', msg);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

const LOOKUP_TYPES = ['account', 'payee', 'category', 'schedule'] as const;

// The underlying API requires plural table names
const TYPE_TO_TABLE: Record<string, string> = {
  account: 'accounts',
  payee: 'payees',
  category: 'categories',
  schedule: 'schedules',
};

export function registerLookupTools(server: McpServer): void {
  server.registerTool('get-id-by-name', {
    description: 'Resolve a human-readable resource name to its internal UUID. Useful for finding IDs before acting on accounts, payees, categories, or schedules by name.',
    inputSchema: {
      type: z.enum(LOOKUP_TYPES).describe('Resource type: account, payee, category, or schedule'),
      name: z.string().describe('Human-readable name to look up'),
    },
  }, async ({ type, name }) => {
    try {
      actualClient.ensureReady();
      const id = await api.getIDByName(TYPE_TO_TABLE[type], name);
      return ok({ id: id ?? null });
    } catch (e) { return fail(e); }
  });
}
