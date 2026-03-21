import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { actualClient } from '../../actual/client';

const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'investment', 'mortgage', 'debt', 'other'] as const;

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function fail(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('[account tool error]', msg);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

export function registerAccountTools(server: McpServer): void {
  server.registerTool('get-accounts', {
    description: 'Get all budget accounts',
  }, async () => {
    try {
      actualClient.ensureReady();
      return ok(await actualClient.api.getAccounts());
    } catch (e) { return fail(e); }
  });

  server.registerTool('get-account-balance', {
    description: 'Get the balance for an account in milliunits.',
    inputSchema: {
      id: z.string().describe('Account ID'),
      cutoff: z.string().optional().describe('YYYY-MM-DD, defaults to today'),
    },
  }, async ({ id, cutoff }) => {
    try {
      actualClient.ensureReady();
      const cutoffDate = cutoff ? new Date(cutoff) : undefined;
      const balance = await actualClient.api.getAccountBalance(id, cutoffDate);
      return ok({ id, balance });
    } catch (e) { return fail(e); }
  });

  server.registerTool('create-account', {
    description: 'Create a new budget account.',
    inputSchema: {
      name: z.string().describe('Account name'),
      type: z.enum(ACCOUNT_TYPES).describe('Account type'),
      offBudget: z.boolean().optional().describe('If true, account is off-budget'),
      initialBalance: z.number().int().optional().describe('Initial balance in milliunits'),
    },
  }, async ({ name, type, offBudget, initialBalance }) => {
    try {
      actualClient.ensureReady();
      const id = await actualClient.api.createAccount(
        { name, type, offBudget: offBudget ?? false },
        initialBalance ?? 0,
      );
      return ok({ id });
    } catch (e) { return fail(e); }
  });

  server.registerTool('update-account', {
    description: 'Update fields of an account.',
    inputSchema: {
      id: z.string().describe('Account ID'),
      name: z.string().optional().describe('New name'),
      type: z.enum(ACCOUNT_TYPES).optional().describe('New type'),
      offBudget: z.boolean().optional().describe('Change on/off-budget status'),
    },
  }, async ({ id, ...fields }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.updateAccount(id, fields);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('close-account', {
    description: 'Close an account. If the balance is non-zero, transferAccountId is required.',
    inputSchema: {
      id: z.string().describe('Account ID to close'),
      transferAccountId: z.string().optional().describe('Account to transfer remaining balance into'),
      transferCategoryId: z.string().optional().describe('Category for the transfer transaction (on→off budget)'),
    },
  }, async ({ id, transferAccountId, transferCategoryId }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.closeAccount(id, transferAccountId, transferCategoryId);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('reopen-account', {
    description: 'Reopen a previously closed account.',
    inputSchema: {
      id: z.string().describe('Account ID'),
    },
  }, async ({ id }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.reopenAccount(id);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('delete-account', {
    description: 'Permanently delete an account and all its transactions. This cannot be undone.',
    inputSchema: {
      id: z.string().describe('Account ID to delete'),
    },
  }, async ({ id }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.deleteAccount(id);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });
}
