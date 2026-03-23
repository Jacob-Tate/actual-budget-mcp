import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
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

/** Read a temp upload by ID, then delete it. Returns { buffer, filename }. */
function consumeUpload(uploadId: string): { buffer: Buffer; filename: string } {
  const dir = path.join(config.actualDataDir, 'uploads', uploadId);
  const files = fs.readdirSync(dir);
  if (files.length === 0) throw new Error(`No file found for uploadId: ${uploadId}`);
  const filename = files[0];
  const buffer = fs.readFileSync(path.join(dir, filename));
  fs.rmSync(dir, { recursive: true, force: true });
  return { buffer, filename };
}

export function registerDocumentTools(server: McpServer): void {
  server.registerTool('upload-document', {
    description: 'Upload a receipt or document to Paperless-NGX. Prefer uploadId (from POST /upload) over content to avoid large base64 in the context window.',
    inputSchema: {
      uploadId: z.string().optional().describe('ID returned by POST /upload — preferred over content for large files'),
      content: z.string().optional().describe('Base64-encoded file content — only use for small files; prefer uploadId'),
      filename: z.string().optional().describe('Filename including extension — required when using content, inferred from upload when using uploadId'),
      title: z.string().optional().describe('Document title — auto-generated from payee and date if omitted'),
      created: z.string().optional().describe('YYYY-MM-DD'),
      payee: z.string().optional().describe('Payee name'),
      accountId: z.string().optional().describe('Actual Budget account ID'),
      accountName: z.string().optional().describe('Actual Budget account name'),
      transactionId: z.string().optional().describe('Actual Budget transaction ID'),
      transactionDate: z.string().optional().describe('YYYY-MM-DD'),
      tags: z.array(z.number().int()).optional().describe('Additional Paperless-NGX tag IDs'),
    },
  }, async ({ uploadId, content, filename, title, created, payee, accountId, accountName, transactionId, transactionDate, tags }) => {
    try {
      if (!config.paperlessUrl || !config.paperlessToken) {
        return fail('Paperless-NGX is not configured. Set PAPERLESS_URL and PAPERLESS_TOKEN environment variables.');
      }

      let buffer: Buffer;
      let resolvedFilename: string;

      if (uploadId) {
        const upload = consumeUpload(uploadId);
        buffer = upload.buffer;
        resolvedFilename = filename ?? upload.filename;
      } else if (content && filename) {
        buffer = Buffer.from(content, 'base64');
        resolvedFilename = filename;
      } else {
        return fail('Provide either uploadId or both content and filename.');
      }

      const ext = resolvedFilename.split('.').pop()?.toLowerCase() ?? '';
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

      const blob = new Blob([buffer], { type: mimeType });
      const form = new FormData();
      form.append('document', blob, resolvedFilename);
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
