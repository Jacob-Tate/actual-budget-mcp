import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { actualClient } from '../../actual/client';

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function fail(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('[category tool error]', msg);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

export function registerCategoryTools(server: McpServer): void {
  server.registerTool('get-categories', {
    description: 'Get all budget categories.',
  }, async () => {
    try {
      actualClient.ensureReady();
      return ok(await actualClient.api.getCategories());
    } catch (e) { return fail(e); }
  });

  server.registerTool('get-category-groups', {
    description: 'Get all category groups, each containing their child categories.',
  }, async () => {
    try {
      actualClient.ensureReady();
      return ok(await actualClient.api.getCategoryGroups());
    } catch (e) { return fail(e); }
  });

  server.registerTool('create-category', {
    description: 'Create a new budget category inside an existing category group.',
    inputSchema: {
      name: z.string().describe('Category name'),
      group_id: z.string().describe('ID of the parent category group'),
      is_income: z.boolean().optional().describe('True if this is an income category'),
    },
  }, async ({ name, group_id, is_income }) => {
    try {
      actualClient.ensureReady();
      const id = await actualClient.api.createCategory({ name, group_id, is_income: is_income ?? false });
      return ok({ id });
    } catch (e) { return fail(e); }
  });

  server.registerTool('update-category', {
    description: 'Update fields of an existing category.',
    inputSchema: {
      id: z.string().describe('Category ID'),
      name: z.string().optional().describe('New name'),
      group_id: z.string().optional().describe('Move to a different category group'),
      is_income: z.boolean().optional().describe('Change income flag'),
    },
  }, async ({ id, ...fields }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.updateCategory(id, fields);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('delete-category', {
    description: 'Delete a category. Transactions in this category will become uncategorized.',
    inputSchema: {
      id: z.string().describe('Category ID to delete'),
    },
  }, async ({ id }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.deleteCategory(id);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('create-category-group', {
    description: 'Create a new category group.',
    inputSchema: {
      name: z.string().describe('Group name'),
      is_income: z.boolean().optional().describe('True if this is the income category group'),
    },
  }, async ({ name, is_income }) => {
    try {
      actualClient.ensureReady();
      const id = await actualClient.api.createCategoryGroup({ name, is_income: is_income ?? false });
      return ok({ id });
    } catch (e) { return fail(e); }
  });

  server.registerTool('update-category-group', {
    description: 'Update fields of an existing category group.',
    inputSchema: {
      id: z.string().describe('Category group ID'),
      name: z.string().optional().describe('New name'),
      is_income: z.boolean().optional().describe('Change income group flag'),
    },
  }, async ({ id, ...fields }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.updateCategoryGroup(id, fields);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('delete-category-group', {
    description: 'Delete a category group. All categories within it must be moved or deleted first.',
    inputSchema: {
      id: z.string().describe('Category group ID to delete'),
    },
  }, async ({ id }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.deleteCategoryGroup(id);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });
}
