# Actual Budget MCP Server

MCP server exposing Actual Budget's personal finance API to Claude.ai via OAuth 2.0.

## Tech Stack

- **Runtime**: Node.js (CommonJS)
- **Language**: TypeScript strict mode
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Budget API**: `@actual-app/api`
- **HTTP**: Express 4
- **Auth**: JWT via `jsonwebtoken`, OAuth 2.0 via MCP SDK's `authRouter`

## Project Structure

```
src/
├── config.ts           # Env var validation (fail-fast on startup)
├── index.ts            # Express app + startup/shutdown lifecycle
├── auth/
│   ├── store.ts        # In-memory OAuth state (codes, tokens, clients)
│   ├── oauth.ts        # OAuthServerProvider + HTML login form
│   └── middleware.ts   # Bearer JWT validation middleware
├── actual/
│   └── client.ts       # @actual-app/api singleton
└── mcp/
    ├── server.ts       # McpServer + tool registration
    └── tools/
        ├── accounts.ts
        ├── transactions.ts
        ├── categories.ts
        ├── payees.ts
        ├── rules.ts
        └── budget.ts
```

## Development

```bash
cp .env.example .env    # fill in your values
npm install
npm run dev             # ts-node hot reload
npm run build           # compile to dist/
npm start               # run compiled output
```

## Amount Convention

Actual Budget uses **integer milliunits**: `100` = $1.00, `1099` = $10.99. All tool inputs/outputs follow this convention.

## Coding Rules

- No file > 300 lines
- No function > 50 lines
- TypeScript strict mode — no `any` without comment justification
- All errors must be logged with context before re-throwing
