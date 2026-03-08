# Actual Budget MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives Claude.ai direct access to your [Actual Budget](https://actualbudget.org) personal finance data.

## Features

- **35 tools** covering accounts, transactions, categories, payees, automation rules, and budgets
- **OAuth 2.0** authentication compatible with Claude.ai's MCP integration
- **Single-user** design — your Actual Budget credentials are configured via environment variables, never stored in tokens
- **Stateless HTTP** transport with `StreamableHTTPServerTransport`

## Tools Available

| Group | Tools |
|-------|-------|
| Accounts | `get-accounts`, `get-account-balance`, `create-account`, `update-account`, `close-account`, `reopen-account`, `delete-account` |
| Transactions | `get-transactions`, `import-transactions`, `add-transactions`, `update-transaction`, `delete-transaction` |
| Categories | `get-categories`, `get-category-groups`, `create-category`, `update-category`, `delete-category`, `create-category-group`, `update-category-group`, `delete-category-group` |
| Payees | `get-payees`, `create-payee`, `update-payee`, `delete-payee`, `merge-payees` |
| Rules | `get-rules`, `create-rule`, `update-rule`, `delete-rule` |
| Budget | `get-budget-months`, `get-budget-month`, `set-budget-amount`, `set-budget-carryover`, `run-bank-sync`, `sync` |

> **Amounts** are always in milliunits: `100` = $1.00, `-4599` = -$45.99

## Quick Start with Docker

```bash
# Pull and run
docker run -d \
  -p 3000:3000 \
  -v actual-data:/app/data \
  -e ACTUAL_SERVER_URL=https://your-actual-server.com \
  -e ACTUAL_SERVER_PASSWORD=your-actual-password \
  -e ACTUAL_SYNC_ID=your-sync-id \
  -e MCP_AUTH_PASSWORD=choose-a-strong-password \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e BASE_URL=https://your-mcp-domain.com \
  ghcr.io/jacob-tate/actual-budget-mcp:latest
```

Or with Docker Compose — see [docker-compose.yml](docker-compose.yml).

## Connecting to Claude.ai

1. In Claude.ai, go to **Settings → Integrations → Add MCP Server**
2. Enter your server URL: `https://your-mcp-domain.com/mcp`
3. A browser popup will open — enter your `MCP_AUTH_PASSWORD`
4. Done — Claude can now access your budget data

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ACTUAL_SERVER_URL` | ✅ | URL of your Actual Budget server |
| `ACTUAL_SERVER_PASSWORD` | ✅ | Actual Budget server password |
| `ACTUAL_SYNC_ID` | ✅ | Budget sync ID (from Actual Budget settings) |
| `MCP_AUTH_PASSWORD` | ✅ | Password shown in the OAuth browser popup |
| `JWT_SECRET` | ✅ | Random string ≥ 32 chars for signing tokens |
| `BASE_URL` | ✅ | Public HTTPS URL of this MCP server |
| `PORT` | — | HTTP port (default: `3000`) |
| `ACTUAL_DATA_DIR` | — | Local cache dir (default: `./data`) |

### Finding your Sync ID

In Actual Budget: **Settings → Show advanced settings → Sync ID**

## Running Without Docker

Requires **Node.js 22 LTS** (`better-sqlite3` won't compile on Node 24).

```bash
nvm use 22        # or: nvm install 22
npm install
cp .env.example .env
# edit .env with your values
npm run build
npm start
```

**Development (hot reload):**
```bash
npm run dev
```

**Type checking:**
```bash
npm run typecheck
```

## Deployment Notes

- Expose port 3000 behind a reverse proxy (nginx, Caddy) with HTTPS
- `BASE_URL` must be the public HTTPS URL — Claude.ai requires HTTPS for OAuth
- The `/data` volume stores Actual Budget's local cache — mount it for persistence
- Tokens expire after 1 hour; clients re-authorize automatically

## Project Structure

```
src/
├── config.ts              # Env var validation
├── index.ts               # Express app + startup
├── auth/
│   ├── store.ts           # In-memory OAuth state
│   ├── oauth.ts           # OAuthServerProvider + login form
│   └── middleware.ts      # Bearer token validation
├── actual/
│   └── client.ts          # @actual-app/api singleton
└── mcp/
    ├── server.ts
    └── tools/
        ├── accounts.ts
        ├── transactions.ts
        ├── categories.ts
        ├── payees.ts
        ├── rules.ts
        └── budget.ts
```

## Planned Features

See [TODO.md](TODO.md) for planned analytics tools (monthly summary, spending by category, balance history, budget vs actual).
