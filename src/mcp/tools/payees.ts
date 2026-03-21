import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { actualClient } from '../../actual/client';

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function fail(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('[payee tool error]', msg);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

export function registerPayeeTools(server: McpServer): void {
  server.registerTool('get-payees', {
    description: 'Get all payees. Transfer payees (linked to accounts) have a transfer_acct field.',
  }, async () => {
    try {
      actualClient.ensureReady();
      return ok(await actualClient.api.getPayees());
    } catch (e) { return fail(e); }
  });

  server.registerTool('create-payee', {
    description: 'Create a new payee.',
    inputSchema: {
      name: z.string().describe('Payee name'),
      category: z.string().optional().describe('Default category ID to auto-assign on import'),
    },
  }, async ({ name, category }) => {
    try {
      actualClient.ensureReady();
      const id = await actualClient.api.createPayee({ name, category: category ?? '' });
      return ok({ id });
    } catch (e) { return fail(e); }
  });

  server.registerTool('update-payee', {
    description: 'Update fields of an existing payee.',
    inputSchema: {
      id: z.string().describe('Payee ID'),
      name: z.string().optional().describe('New name'),
      category: z.string().optional().describe('New default category ID'),
    },
  }, async ({ id, ...fields }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.updatePayee(id, fields);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('delete-payee', {
    description: 'Delete a payee. Transactions referencing this payee will have their payee cleared.',
    inputSchema: {
      id: z.string().describe('Payee ID to delete'),
    },
  }, async ({ id }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.deletePayee(id);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('merge-payees', {
    description: 'Merge one or more payees into a target payee, retaining the target\'s name. All transactions from merged payees will be reassigned to the target.',
    inputSchema: {
      targetId: z.string().describe('ID of the payee to keep'),
      mergeIds: z.array(z.string()).min(1).describe('IDs of payees to merge into the target'),
    },
  }, async ({ targetId, mergeIds }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.mergePayees(targetId, mergeIds);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });
}
