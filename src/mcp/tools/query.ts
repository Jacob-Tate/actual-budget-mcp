import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { actualClient } from '../../actual/client';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { q, runQuery } = require('@actual-app/api') as {
  q: (table: string) => AQLQueryBuilder;
  runQuery: (query: AQLQueryBuilder) => Promise<{ data: unknown[] }>;
};

interface AQLQueryBuilder {
  filter(conditions: Record<string, unknown>): AQLQueryBuilder;
  select(fields: string[] | string): AQLQueryBuilder;
  orderBy(field: string, dir?: 'asc' | 'desc'): AQLQueryBuilder;
  limit(n: number): AQLQueryBuilder;
  offset(n: number): AQLQueryBuilder;
  calculate(expr: Record<string, unknown>): AQLQueryBuilder;
}

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function fail(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('[query tool error]', msg);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

const VALID_TABLES = [
  'transactions', 'accounts', 'categories', 'category_groups',
  'payees', 'rules', 'schedules',
] as const;

export function registerQueryTools(server: McpServer): void {
  server.registerTool('run-query', {
    description:
      'Run an AQL query against the Actual Budget database. ' +
      'Amounts in milliunits. ' +
      'Use this for ad-hoc questions not covered by other tools. ' +
      'Valid tables: transactions, accounts, categories, category_groups, payees, rules, schedules.',
    inputSchema: {
      table: z.enum(VALID_TABLES).describe('Table to query'),
      filter: z
        .record(z.unknown())
        .optional()
        .describe(
          'Filter conditions as an AQL object. ' +
          'Examples: {"amount": {"$lt": 0}}, {"payee.name": {"$like": "%Whole Foods%"}}, ' +
          '{"date": {"$gte": "2024-01-01", "$lte": "2024-12-31"}}',
        ),
      select: z
        .array(z.string())
        .optional()
        .describe('Fields to return. Omit to return all fields.'),
      orderBy: z
        .object({
          field: z.string(),
          dir: z.enum(['asc', 'desc']).optional(),
        })
        .optional()
        .describe('Sort order, e.g. {"field": "date", "dir": "desc"}'),
      limit: z.number().int().positive().optional().describe('Max rows to return (default: no limit)'),
      offset: z.number().int().nonnegative().optional().describe('Rows to skip (for pagination)'),
    },
  }, async ({ table, filter, select, orderBy, limit, offset }) => {
    try {
      actualClient.ensureReady();

      let query: AQLQueryBuilder = q(table);

      if (filter && Object.keys(filter).length > 0) {
        query = query.filter(filter);
      }
      if (select && select.length > 0) {
        query = query.select(select);
      }
      if (orderBy) {
        query = query.orderBy(orderBy.field, orderBy.dir ?? 'asc');
      }
      if (limit !== undefined) {
        query = query.limit(limit);
      }
      if (offset !== undefined) {
        query = query.offset(offset);
      }

      const result = await runQuery(query);
      return ok({ rows: result.data, count: result.data.length });
    } catch (e) { return fail(e); }
  });
}
