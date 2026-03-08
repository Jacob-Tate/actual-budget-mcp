import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { actualClient } from '../../actual/client';

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('[budget tool error]', msg);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

export function registerBudgetTools(server: McpServer): void {
  server.registerTool('get-budget-months', {
    description: 'Get a list of all months that have budget data, in YYYY-MM format.',
  }, async () => {
    try {
      actualClient.ensureReady();
      return ok(await actualClient.api.getBudgetMonths());
    } catch (e) { return fail(e); }
  });

  server.registerTool('get-budget-month', {
    description: 'Get budget data for a specific month, including all category groups with their budgeted and spent amounts. Amounts are in milliunits (100 = $1.00).',
    inputSchema: {
      month: z.string().describe('Month in YYYY-MM format (e.g. "2024-03")'),
    },
  }, async ({ month }) => {
    try {
      actualClient.ensureReady();
      return ok(await actualClient.api.getBudgetMonth(month));
    } catch (e) { return fail(e); }
  });

  server.registerTool('set-budget-amount', {
    description: 'Set the budgeted amount for a category in a given month. Amount is in milliunits (100 = $1.00).',
    inputSchema: {
      month: z.string().describe('Month in YYYY-MM format'),
      categoryId: z.string().describe('Category ID'),
      amount: z.number().int().describe('Budgeted amount in milliunits (100 = $1.00)'),
    },
  }, async ({ month, categoryId, amount }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.setBudgetAmount(month, categoryId, amount);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('set-budget-carryover', {
    description: 'Enable or disable rollover (carryover) for a budget category. When enabled, unspent money carries forward to the next month.',
    inputSchema: {
      month: z.string().describe('Month in YYYY-MM format'),
      categoryId: z.string().describe('Category ID'),
      enabled: z.boolean().describe('True to enable carryover, false to disable'),
    },
  }, async ({ month, categoryId, enabled }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.setBudgetCarryover(month, categoryId, enabled);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('run-bank-sync', {
    description: 'Run the 3rd-party bank sync (GoCardless or SimpleFIN) to download new transactions. Provide accountId to sync a single account, or omit to sync all linked accounts.',
    inputSchema: {
      accountId: z.string().optional().describe('Account ID to sync. Omit to sync all accounts.'),
    },
  }, async ({ accountId }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.runBankSync(accountId ? { accountId } : undefined);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('sync', {
    description: 'Sync the local budget cache with the Actual Budget server to pull in any changes made elsewhere.',
  }, async () => {
    try {
      actualClient.ensureReady();
      await actualClient.api.sync();
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });
}
