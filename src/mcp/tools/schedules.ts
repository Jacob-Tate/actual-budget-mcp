import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { actualClient } from '../../actual/client';

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('[schedule tool error]', msg);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

const RecurPatternSchema = z.object({
  value: z.number().int(),
  type: z.enum(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'day']),
});

const RecurConfigSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().optional(),
  patterns: z.array(RecurPatternSchema).optional(),
  skipWeekend: z.boolean().optional(),
  start: z.string().describe('ISO date string YYYY-MM-DD'),
  endMode: z.enum(['never', 'after_n_occurrences', 'on_date']).optional(),
  endOccurrences: z.number().int().optional(),
  endDate: z.string().optional().describe('ISO date string YYYY-MM-DD'),
  weekendSolveMode: z.enum(['before', 'after']).optional(),
});

const ScheduleInputSchema = {
  name: z.string().optional().describe('Schedule name'),
  payee: z.string().optional().describe('Payee ID'),
  account: z.string().optional().describe('Account ID'),
  amount: z.number().int().optional().describe('Amount in milliunits (100 = $1.00). Negative for expenses.'),
  amountOp: z.enum(['is', 'isapprox', 'isbetween']).describe('Amount match operator'),
  date: z.union([z.string(), RecurConfigSchema]).describe(
    'ISO date string (YYYY-MM-DD) for one-time, or recurrence config object for recurring schedules',
  ),
  posts_transaction: z.boolean().optional().describe('Whether the schedule auto-posts a transaction'),
  completed: z.boolean().optional().describe('Whether the schedule is completed/inactive'),
};

export function registerScheduleTools(server: McpServer): void {
  server.registerTool('get-schedules', {
    description: 'Get all schedules (recurring transactions). Amounts are in milliunits (100 = $1.00).',
  }, async () => {
    try {
      actualClient.ensureReady();
      return ok(await actualClient.api.getSchedules());
    } catch (e) { return fail(e); }
  });

  server.registerTool('create-schedule', {
    description: 'Create a new schedule (recurring transaction). Amounts are in milliunits (100 = $1.00, -1099 = -$10.99).',
    inputSchema: ScheduleInputSchema,
  }, async (fields) => {
    try {
      actualClient.ensureReady();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const id = await actualClient.api.createSchedule(fields as any);
      return ok({ id });
    } catch (e) { return fail(e); }
  });

  server.registerTool('update-schedule', {
    description: 'Update fields of an existing schedule. Amounts are in milliunits (100 = $1.00).',
    inputSchema: {
      id: z.string().describe('Schedule ID'),
      resetNextDate: z.boolean().optional().describe('If true, recalculate next_date from recurrence rule'),
      ...Object.fromEntries(
        Object.entries(ScheduleInputSchema).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()]),
      ),
    },
  }, async ({ id, resetNextDate, ...fields }) => {
    try {
      actualClient.ensureReady();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await actualClient.api.updateSchedule(id, fields as any, resetNextDate);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('delete-schedule', {
    description: 'Permanently delete a schedule.',
    inputSchema: {
      id: z.string().describe('Schedule ID'),
    },
  }, async ({ id }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.deleteSchedule(id);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });
}
