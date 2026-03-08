import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { actualClient } from '../../actual/client';

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('[tag tool error]', msg);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

export function registerTagTools(server: McpServer): void {
  server.registerTool('get-tags', {
    description: 'Get all tags. Tags label transactions across category boundaries (e.g. "vacation", "home renovation").',
  }, async () => {
    try {
      actualClient.ensureReady();
      return ok(await actualClient.api.getTags());
    } catch (e) { return fail(e); }
  });

  server.registerTool('create-tag', {
    description: 'Create a new tag.',
    inputSchema: {
      name: z.string().describe('Tag name (e.g. "vacation", "home renovation")'),
    },
  }, async ({ name }) => {
    try {
      actualClient.ensureReady();
      const id = await actualClient.api.createTag({ name });
      return ok({ id });
    } catch (e) { return fail(e); }
  });

  server.registerTool('update-tag', {
    description: 'Update fields of an existing tag.',
    inputSchema: {
      id: z.string().describe('Tag ID'),
      name: z.string().optional().describe('New tag name'),
    },
  }, async ({ id, ...fields }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.updateTag(id, fields);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });

  server.registerTool('delete-tag', {
    description: 'Delete a tag.',
    inputSchema: {
      id: z.string().describe('Tag ID to delete'),
    },
  }, async ({ id }) => {
    try {
      actualClient.ensureReady();
      await actualClient.api.deleteTag(id);
      return ok({ success: true });
    } catch (e) { return fail(e); }
  });
}
