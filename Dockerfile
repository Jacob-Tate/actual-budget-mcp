# syntax=docker/dockerfile:1

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Install build tools needed by better-sqlite3 (native addon)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first for layer caching
COPY package.json package-lock.json ./

# Full install including native compilation
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

WORKDIR /app

# Install runtime libs needed by better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests and install production deps only (re-compiles native addons)
COPY package.json package-lock.json ./
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && npm ci --omit=dev \
    && apt-get purge -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled application from builder
COPY --from=builder /app/dist ./dist

# Data directory for Actual Budget local cache
RUN mkdir -p /app/data

# Drop root
RUN useradd --system --uid 1001 --gid root mcp
RUN chown -R mcp:root /app/data
USER mcp

VOLUME ["/app/data"]

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000 \
    ACTUAL_DATA_DIR=/app/data

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT||3000) + '/.well-known/oauth-authorization-server', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
