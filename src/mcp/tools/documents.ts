import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { config } from '../../config';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  tiff: 'image/tiff',
  tif: 'image/tiff',
};

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function fail(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('[documents tool error]', msg);
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

function buildTitle(payee?: string, transactionDate?: string): string {
  if (payee && transactionDate) return `${payee} Receipt – ${transactionDate}`;
  if (payee) return `${payee} Receipt`;
  if (transactionDate) return `Receipt – ${transactionDate}`;
  return 'Receipt';
}

export function registerDocumentTools(server: McpServer): void {
  server.registerTool('upload-document', {
    description: 'Upload a receipt or document to Paperless-NGX. Automatically applies the configured receipt tag and stores transaction metadata as custom fields.',
    inputSchema: {
      content: z.string().describe('Base64-encoded file content'),
      filename: z.string().describe('Filename including extension (e.g. receipt.jpg)'),
      title: z.string().optional().describe('Document title — auto-generated from payee and date if omitted'),
      created: z.string().optional().describe('YYYY-MM-DD'),
      payee: z.string().optional().describe('Payee name'),
      accountId: z.string().optional().describe('Actual Budget account ID'),
      accountName: z.string().optional().describe('Actual Budget account name'),
      transactionId: z.string().optional().describe('Actual Budget transaction ID'),
      transactionDate: z.string().optional().describe('YYYY-MM-DD'),
      tags: z.array(z.number().int()).optional().describe('Additional Paperless-NGX tag IDs'),
    },
  }, async ({ content, filename, title, created, payee, accountId, accountName, transactionId, transactionDate, tags }) => {
    try {
      if (!config.paperlessUrl || !config.paperlessToken) {
        return fail('Paperless-NGX is not configured. Set PAPERLESS_URL and PAPERLESS_TOKEN environment variables.');
      }

      const ext = filename.split('.').pop()?.toLowerCase() ?? '';
      const mimeType = MIME[ext] ?? 'application/octet-stream';

      const resolvedTitle = title ?? buildTitle(payee, transactionDate);

      // Merge receipt tag with any caller-supplied tags
      const allTags = [...(tags ?? [])];
      if (config.paperlessReceiptTagId && !allTags.includes(config.paperlessReceiptTagId)) {
        allTags.push(config.paperlessReceiptTagId);
      }

      // Build custom fields from env-configured field IDs
      const customFields: { field: number; value: string }[] = [];
      const fieldMap: [number | undefined, string | undefined][] = [
        [config.paperlessFieldPayee, payee],
        [config.paperlessFieldAccountId, accountId],
        [config.paperlessFieldAccountName, accountName],
        [config.paperlessFieldTransactionId, transactionId],
        [config.paperlessFieldTransactionDate, transactionDate],
      ];
      for (const [fieldId, value] of fieldMap) {
        if (fieldId !== undefined && value !== undefined) {
          customFields.push({ field: fieldId, value });
        }
      }

      const buffer = Buffer.from(content, 'base64');
      const blob = new Blob([buffer], { type: mimeType });

      const form = new FormData();
      form.append('document', blob, filename);
      form.append('title', resolvedTitle);
      if (created ?? transactionDate) form.append('created', created ?? transactionDate!);
      allTags.forEach(t => form.append('tags', String(t)));
      if (customFields.length > 0) {
        form.append('custom_fields', JSON.stringify(customFields));
      }

      const res = await fetch(`${config.paperlessUrl}/api/documents/post_document/`, {
        method: 'POST',
        headers: { Authorization: `Token ${config.paperlessToken}` },
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        return fail(`Paperless-NGX returned ${res.status}: ${text}`);
      }

      const data = await res.json() as unknown;
      return ok(data);
    } catch (e) { return fail(e); }
  });
}
