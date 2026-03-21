import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { actualClient } from '../../actual/client';

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function fail(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('[rule tool error]', msg);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

/**
 * A condition or action object. Fields vary by operator/field type.
 * Example condition: { field: 'payee', op: 'is', value: 'payee-id' }
 * Example action:    { op: 'set', field: 'category', value: 'category-id' }
 */
const conditionOrActionSchema = z.record(z.unknown()).describe(
  'Condition or action object. Conditions have: field, op, value. Actions have: op, field, value.',
);

export function registerRuleTools(server: McpServer): void {
  server.registerTool('get-rules', {
    description: 'Get all automation rules. Each rule has conditions and actions that run during transaction import.',
  }, async () => {
    try {
      actualClient.ensureReady();
      return ok(await actualClient.api.getRules());
    } catch (e) { return fail(e); }
  });

  server.registerTool('create-rule', {
    description: `Create an automation rule. Rules run during import-transactions.
Stage: "pre" (runs first) or "post" (runs after category learning).
conditionsOp: "and" or "or".
Condition example: { "field": "payee", "op": "is", "value": "payee-id" }
Action example: { "op": "set", "field": "category", "value": "category-id" }`,
    inputSchema: {
      stage: z.enum(['pre', 'post']).describe('When this rule runs: "pre" or "post"'),
      conditionsOp: z.enum(['and', 'or']).describe('Whether all ("and") or any ("or") conditions must match'),
      conditions: z.array(conditionOrActionSchema).min(1).describe('List of condition objects'),
      actions: z.array(conditionOrActionSchema).min(1).describe('List of action objects to apply when conditions match'),
    },
  }, async ({ stage, conditionsOp, conditions, actions }) => {
    try {
      actualClient.ensureReady();
      const rule = await actualClient.api.createRule({ stage, conditionsOp, conditions, actions });
      return ok(rule);
    } catch (e) { return fail(e); }
  });

  server.registerTool('update-rule', {
    description: 'Update fields of an existing rule.',
    inputSchema: {
      id: z.string().describe('Rule ID'),
      stage: z.enum(['pre', 'post']).optional().describe('New stage'),
      conditionsOp: z.enum(['and', 'or']).optional().describe('New conditions operator'),
      conditions: z.array(conditionOrActionSchema).optional().describe('New conditions list'),
      actions: z.array(conditionOrActionSchema).optional().describe('New actions list'),
    },
  }, async ({ id, ...fields }) => {
    try {
      actualClient.ensureReady();
      const rule = await actualClient.api.updateRule(id, fields);
      return ok(rule);
    } catch (e) { return fail(e); }
  });

  server.registerTool('delete-rule', {
    description: 'Delete an automation rule by ID.',
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
