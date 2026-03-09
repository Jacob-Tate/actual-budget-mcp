import express from 'express';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { oauthProvider } from './auth/oauth';
import { bearerAuthMiddleware } from './auth/middleware';
import { revokeToken, revokeRefreshToken } from './auth/store';
import { createMcpServer } from './mcp/server';
import { actualClient } from './actual/client';

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
    console.error('Unhandled promise rejection:', reason);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
