import express from 'express';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import jwt from 'jsonwebtoken';
import multer, { MulterError } from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { oauthProvider } from './auth/oauth';
import { bearerAuthMiddleware } from './auth/middleware';
import { revokeToken, revokeRefreshToken } from './auth/store';
import { createMcpServer } from './mcp/server';
import { actualClient } from './actual/client';

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

function cleanupStaleUploads(uploadDir: string): void {
  if (!fs.existsSync(uploadDir)) return;
  const cutoff = Date.now() - UPLOAD_TTL_MS;
  for (const entry of fs.readdirSync(uploadDir)) {
    const dir = path.join(uploadDir, entry);
    try {
      if (fs.statSync(dir).mtimeMs < cutoff) fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}

async function main(): Promise<void> {
  await actualClient.initialize();

  const app = express();

  // Trust the first proxy hop (nginx/caddy in front of this container)
  app.set('trust proxy', 1);

  // Parse JSON bodies (needed for MCP POST requests)
  app.use(express.json());

  // Parse URL-encoded bodies (needed for OAuth form POST)
  app.use(express.urlencoded({ extended: false }));

  // Mount OAuth 2.0 endpoints:
  //   GET  /.well-known/oauth-authorization-server
  //   GET  /.well-known/oauth-protected-resource
  //   POST /register
  //   GET  /authorize
  //   POST /authorize
  //   POST /token
  //   POST /revoke  (RFC 7009, added below)
  app.use(mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: new URL(config.baseUrl),
    resourceName: 'Actual Budget MCP',
  }));

  // RFC 7009 — Token Revocation (no auth required; always returns 200)
  app.post('/revoke', (req, res) => {
    const token = req.body?.token as string | undefined;
    if (token) {
      const payload = jwt.decode(token) as { jti?: string } | null;
      if (payload?.jti) {
        // Access token — revoke by JWT ID
        revokeToken(payload.jti);
      } else {
        // Opaque refresh token (UUID)
        revokeRefreshToken(token);
      }
    }
    res.status(200).json({});
  });

  // Temporary image upload endpoint — unauthenticated, images only, 5 MB limit, 24-hour TTL.
  // Claude curls the file here first, then passes the returned uploadId to upload-document.
  const uploadDir = path.join(config.actualDataDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  cleanupStaleUploads(uploadDir);
  setInterval(() => cleanupStaleUploads(uploadDir), 60 * 60 * 1000).unref();

  const upload = multer({
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        cb(new Error('Only image files are accepted'));
        return;
      }
      cb(null, true);
    },
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(uploadDir, uuidv4());
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => cb(null, file.originalname),
    }),
  });

  app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided. Send a multipart/form-data request with a "file" field.' });
      return;
    }
    const uploadId = path.basename(path.dirname(req.file.path));
    res.json({ uploadId, filename: req.file.originalname });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File exceeds 5 MB limit' });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Unknown error' });
  });

  // MCP endpoint — stateless mode (new transport per request)
  app.all('/mcp', bearerAuthMiddleware, async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    try {
      await server.connect(transport);
      // Pass parsed body for POST requests; GET uses SSE
      await transport.handleRequest(req, res, req.method === 'POST' ? req.body : undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[mcp request error]', msg);
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_error', message: msg });
      }
    } finally {
      await server.close().catch(() => { /* ignore close errors */ });
    }
  });

  const httpServer = app.listen(config.port, () => {
    console.log(`Actual Budget MCP server running`);
    console.log(`  Port:     ${config.port}`);
    console.log(`  Base URL: ${config.baseUrl}`);
    console.log(`  MCP URL:  ${config.baseUrl}/mcp`);
  });

  const shutdown = async (): Promise<void> => {
    console.log('Shutting down...');
    httpServer.close();
    await actualClient.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
  process.on('unhandledRejection', (reason) => {
    // The @actual-app/api runHandler has a bug where `void promise.then(...)`
    // on a rejected handler creates a dangling rejected promise. These rejections
    // are already caught by tool try/catch blocks — don't crash for them.
    if (reason !== null && typeof reason === 'object') {
      const r = reason as Record<string, unknown>;
      if (r.type === 'APIError') {
        console.error('Unhandled APIError (suppressed crash):', r.message);
        return;
      }
      // Plain errors thrown from @actual-app/api mutators (e.g. duplicate schedule name)
      // also escape as unhandled rejections despite being caught by the tool's try/catch.
      if (reason instanceof Error && typeof r.stack === 'string' && r.stack.includes('bundle.api.js')) {
        console.error('Unhandled @actual-app/api error (suppressed crash):', reason.message);
        return;
      }
    }
    console.error('Unhandled promise rejection:', reason);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
