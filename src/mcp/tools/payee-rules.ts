import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { actualClient } from '../../actual/client';

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function fail(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('[payee-rule tool error]', msg);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

const actionSchema = z.record(z.unknown()).describe(
  'Action object. Example: { "op": "set", "field": "category", "value": "category-id" }',
);

export function registerPayeeRuleTools(server: McpServer): void {
  server.registerTool('get-payee-rules', {
    description: 'Get all automation rules associated with a specific payee.',
    inputSchema: {
      payeeId: z.string().describe('Payee ID'),
    },
  }, async ({ payeeId }) => {
    try {
      actualClient.ensureReady();
      return ok(await actualClient.api.getPayeeRules(payeeId));
    } catch (e) { return fail(e); }
  });

  server.registerTool('create-payee-rule', {
    description: `Create a rule scoped to a specific payee. The rule will automatically include a condition matching the payee.
Stage: "pre" (runs first) or "post" (runs after category learning).
Action example: { "op": "set", "field": "category", "value": "category-id" }`,
    inputSchema: {
      payeeId: z.string().describe('Payee ID to scope this rule to'),
      stage: z.enum(['pre', 'post']).describe('When this rule runs: "pre" or "post"'),
      actions: z.array(actionSchema).min(1).describe('List of action objects to apply when the payee matches'),
    },
  }, async ({ payeeId, stage, actions }) => {
    try {
      actualClient.ensureReady();
      const rule = await actualClient.api.createRule({
        stage,
        conditionsOp: 'and',
        conditions: [{ field: 'payee', op: 'is', value: payeeId }],
        actions,
      });
      return ok(rule);
    } catch (e) { return fail(e); }
  });

  server.registerTool('update-payee-rule', {
    description: 'Update an existing payee rule by ID.',
    inputSchema: {
      id: z.string().describe('Rule ID to update'),
      stage: z.enum(['pre', 'post']).optional().describe('New stage'),
      actions: z.array(actionSchema).optional().describe('New actions list'),
    },
  }, async ({ id, ...fields }) => {
    try {
      actualClient.ensureReady();
      const rule = await actualClient.api.updateRule(id, fields);
      return ok(rule);
    } catch (e) { return fail(e); }
  });

  server.registerTool('delete-payee-rule', {
    description: 'Delete a payee rule by ID.',
    inputSchema: {
      id: z.string().describe('Rule ID to delete'),
    },
  }, async ({ id }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.deleteRule(id);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });
}
