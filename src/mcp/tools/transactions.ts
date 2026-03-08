import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { actualClient } from '../../actual/client';

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('[transaction tool error]', msg);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

// Subtransaction schema for split transactions
const subtransactionSchema = z.object({
  amount: z.number().int().describe('Amount in milliunits (100 = $1.00, negative = expense). All subtransaction amounts must sum to the parent amount.'),
  category: z.string().optional().describe('Category ID'),
  notes: z.string().optional().describe('Notes/memo for this line item'),
  payee: z.string().optional().describe('Payee ID (defaults to parent payee if omitted)'),
});

// Core transaction fields — field names match the Actual Budget internal API
// (uses "category" and "payee", not "category_id"/"payee_id")
const transactionSchema = {
  date: z.string().describe('Date in YYYY-MM-DD format'),
  amount: z.number().int().describe('Amount in milliunits (100 = $1.00, negative = expense)'),
  payee: z.string().optional().describe('Payee ID'),
  payee_name: z.string().optional().describe('Payee name — creates a new payee if not found. Alternative to payee ID.'),
  category: z.string().optional().describe('Category ID. Omit for split transactions (use subtransactions instead).'),
  notes: z.string().optional().describe('Notes/memo'),
  imported_id: z.string().optional().describe('External ID for deduplication in import-transactions'),
  cleared: z.boolean().optional().describe('Whether the transaction is cleared'),
  subtransactions: z.array(subtransactionSchema).optional().describe(
    'Line items for split transactions. When provided, the parent has no category and the amounts here must sum to the parent amount.'
  ),
};

export function registerTransactionTools(server: McpServer): void {
  server.registerTool('get-transactions', {
    description: 'Get all transactions for an account within a date range. Amounts are in milliunits (100 = $1.00). Split transactions include a subtransactions array.',
    inputSchema: {
      accountId: z.string().describe('Account ID'),
      startDate: z.string().describe('Start date YYYY-MM-DD (inclusive)'),
      endDate: z.string().describe('End date YYYY-MM-DD (inclusive)'),
    },
  }, async ({ accountId, startDate, endDate }) => {
    try {
      actualClient.ensureReady();
      const txns = await actualClient.api.getTransactions(accountId, startDate, endDate);
      return ok(txns);
    } catch (e) { return fail(e); }
  });

  server.registerTool('import-transactions', {
    description: 'Import transactions with full reconciliation: deduplication via imported_id, rule application, and transfer detection. Preferred over add-transactions for bank imports. Supports split transactions via subtransactions array.',
    inputSchema: {
      accountId: z.string().describe('Account ID'),
      transactions: z.array(z.object(transactionSchema)).describe('Array of transactions to import'),
    },
  }, async ({ accountId, transactions }) => {
    try {
      actualClient.ensureReady();
      const result = await actualClient.api.importTransactions(accountId, transactions);
      return ok(result);
    } catch (e) { return fail(e); }
  });

  server.registerTool('add-transactions', {
    description: 'Add raw transactions without deduplication or rule processing. Use import-transactions for bank imports. Supports split transactions via subtransactions array.',
    inputSchema: {
      accountId: z.string().describe('Account ID'),
      transactions: z.array(z.object(transactionSchema)).describe('Array of transactions to add'),
    },
  }, async ({ accountId, transactions }) => {
    try {
      actualClient.ensureReady();
      const ids = await actualClient.api.addTransactions(accountId, transactions);
      return ok({ added: ids });
    } catch (e) { return fail(e); }
  });

  server.registerTool('update-transaction', {
    description: 'Update fields of an existing transaction. Amount is in milliunits (100 = $1.00).',
    inputSchema: {
      id: z.string().describe('Transaction ID'),
      date: z.string().optional().describe('New date YYYY-MM-DD'),
      amount: z.number().int().optional().describe('New amount in milliunits'),
      payee: z.string().optional().describe('New payee ID'),
      category: z.string().optional().describe('New category ID'),
      notes: z.string().optional().describe('New notes'),
      cleared: z.boolean().optional().describe('New cleared status'),
    },
  }, async ({ id, ...fields }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.updateTransaction(id, fields);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('delete-transaction', {
    description: 'Delete a transaction by ID.',
    inputSchema: {
      id: z.string().describe('Transaction ID to delete'),
    },
  }, async ({ id }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.deleteTransaction(id);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });
}
