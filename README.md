# Actual Budget MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives Claude.ai direct access to your [Actual Budget](https://actualbudget.org) personal finance data.

## Features

- **52 tools** covering accounts, transactions, categories, payees, automation rules, budgets, schedules, tags, analytics, ad-hoc queries, and name-to-ID lookup
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
| Budget | `get-budget-months`, `get-budget-month`, `set-budget-amount`, `set-budget-carryover`, `hold-budget-for-next-month`, `reset-budget-hold`, `batch-set-budget-amounts`, `run-bank-sync`, `sync` |
| Schedules | `get-schedules`, `create-schedule`, `update-schedule`, `delete-schedule` |
| Tags | `get-tags`, `create-tag`, `update-tag`, `delete-tag` |
| Analytics | `monthly-summary`, `spending-by-category`, `budget-vs-actual`, `balance-history` |
| Query | `run-query` |
| Lookup | `get-id-by-name` |

> **Amounts** are always in milliunits: `100` = $1.00, `-4599` = -$45.99

## Example Prompts

Once connected, you can ask Claude things like:

**Spending & Transactions**
- "What did I spend on dining last month?"
- "Show me all Amazon charges in the last 60 days"
- "Categorize my last 20 uncategorized transactions"
- "Find any transaction over $500 this year"

**Budgeting**
- "Set my Groceries budget to $500 for April"
- "How am I tracking against my budget this month?"
- "Which categories am I over budget on?"
- "Copy this month's budget amounts to next month"

**Financial Health**
- "How has my dining spending changed over the last 6 months?"
- "What's my income vs spending trend for Q1?"
- "Which categories do I consistently overspend?"

**Accounts & Payees**
- "What's my current checking account balance?"
- "Merge all 'Whole Foods' and 'Whole Foods Market' payees together"
- "Show me my net worth across all accounts"

**Schedules & Rules**
- "What recurring bills are due in the next two weeks?"
- "Create a rule to always categorize Spotify as Entertainment"
- "Set up a monthly $1,200 rent transaction on the 1st"

---

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
| `AUTH_DB_PATH` | — | SQLite DB for OAuth tokens (default: `{ACTUAL_DATA_DIR}/auth.db`) |

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

**Type checking** (slow — avoid; use `npm run build` instead):
```bash
npm run typecheck
```

## Token Revocation

To invalidate a token immediately (e.g. suspected leak, forcing re-auth):

```bash
# Revoke an access token (JWT)
curl -X POST https://your-mcp-domain.com/revoke \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=<access_token>"

# Revoke a refresh token (UUID)
curl -X POST https://your-mcp-domain.com/revoke \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=<refresh_token>"
```

Always returns `200 OK` per [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009) — even if the token didn't exist.

> **To invalidate all tokens at once:** rotate `JWT_SECRET` in `.env` and restart. All issued JWTs immediately fail signature verification.

## Deployment Notes

- Expose port 3000 behind a reverse proxy (nginx, Caddy) with HTTPS
- `BASE_URL` must be the public HTTPS URL — Claude.ai requires HTTPS for OAuth
- The `/data` volume stores Actual Budget's local cache — mount it for persistence
- OAuth tokens are persisted in SQLite (`./data/auth.db`) — survive restarts
- Access tokens expire after 24 hours; refresh tokens last 90 days and rotate silently

## Project Structure

```
src/
├── config.ts              # Env var validation
├── index.ts               # Express app + startup
├── auth/
│   ├── db.ts              # SQLite singleton + schema init
│   ├── store.ts           # SQLite-backed OAuth state (tokens, clients)
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
        ├── budget.ts
        ├── schedules.ts
        ├── tags.ts
        ├── analytics.ts
        ├── query.ts
        └── lookup.ts
```
