import { config as loadDotenv } from 'dotenv';
import path from 'path';

loadDotenv();

export interface Config {
  actualServerUrl: string;
  actualServerPassword: string;
  actualSyncId: string;
  actualDataDir: string;
  authDbPath: string;
  mcpAuthPassword: string;
  jwtSecret: string;
  port: number;
  baseUrl: string;
  paperlessUrl?: string;
  paperlessToken?: string;
  paperlessReceiptTagId?: number;
  paperlessFieldPayee?: number;
  paperlessFieldAccountId?: number;
  paperlessFieldAccountName?: number;
  paperlessFieldTransactionId?: number;
  paperlessFieldTransactionDate?: number;
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

function loadConfig(): Config {
  const jwtSecret = requireEnv('JWT_SECRET');
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  const portStr = process.env['PORT'] ?? '3000';
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a valid port number, got: ${portStr}`);
  }

  function optionalInt(key: string): number | undefined {
    const val = process.env[key];
    if (!val) return undefined;
    const n = parseInt(val, 10);
    return isNaN(n) ? undefined : n;
  }

  const dataDir = process.env['ACTUAL_DATA_DIR'] ?? './data';
  const authDbPath = process.env['AUTH_DB_PATH'] ?? path.join(dataDir, 'auth.db');

  return {
    actualServerUrl: requireEnv('ACTUAL_SERVER_URL'),
    actualServerPassword: requireEnv('ACTUAL_SERVER_PASSWORD'),
    actualSyncId: requireEnv('ACTUAL_SYNC_ID'),
    actualDataDir: path.resolve(dataDir),
    authDbPath: path.resolve(authDbPath),
    mcpAuthPassword: requireEnv('MCP_AUTH_PASSWORD'),
    jwtSecret,
    port,
    baseUrl: requireEnv('BASE_URL'),
    paperlessUrl: process.env['PAPERLESS_URL'] ?? undefined,
    paperlessToken: process.env['PAPERLESS_TOKEN'] ?? undefined,
    paperlessReceiptTagId: optionalInt('PAPERLESS_RECEIPT_TAG_ID'),
    paperlessFieldPayee: optionalInt('PAPERLESS_FIELD_PAYEE'),
    paperlessFieldAccountId: optionalInt('PAPERLESS_FIELD_ACCOUNT_ID'),
    paperlessFieldAccountName: optionalInt('PAPERLESS_FIELD_ACCOUNT_NAME'),
    paperlessFieldTransactionId: optionalInt('PAPERLESS_FIELD_TRANSACTION_ID'),
    paperlessFieldTransactionDate: optionalInt('PAPERLESS_FIELD_TRANSACTION_DATE'),
  };
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

export const config = getConfig();
