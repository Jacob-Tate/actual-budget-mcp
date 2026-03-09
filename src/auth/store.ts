import { randomUUID } from 'crypto';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { getAuthDb } from './db';

export type { OAuthClientInformationFull };

export interface AuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
  used: boolean;
}

export interface TokenRecord {
  jti: string;
  clientId: string;
  expiresAt: number;
  revoked: boolean;
}

export interface RefreshTokenRecord {
  token: string;
  clientId: string;
  expiresAt: number;
  revoked: boolean;
}

// ── Clients ──────────────────────────────────────────────────────────────────

export function saveClient(client: OAuthClientInformationFull): void {
  const db = getAuthDb();
  db.prepare(`
    INSERT INTO clients (client_id, data) VALUES (?, ?)
    ON CONFLICT(client_id) DO UPDATE SET data = excluded.data
  `).run(client.client_id, JSON.stringify(client));
}

export function getClient(clientId: string): OAuthClientInformationFull | undefined {
  const row = getAuthDb()
    .prepare('SELECT data FROM clients WHERE client_id = ?')
    .get(clientId) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as OAuthClientInformationFull) : undefined;
}

export function registerClient(
  partial: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
): OAuthClientInformationFull {
  const client: OAuthClientInformationFull = {
    ...partial,
    client_id: randomUUID(),
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
  saveClient(client);
  return client;
}

// ── Auth Codes ────────────────────────────────────────────────────────────────

export function createAuthCode(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}): AuthCode {
  const code: AuthCode = {
    code: randomUUID(),
    used: false,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    ...params,
  };
  getAuthDb().prepare(`
    INSERT INTO auth_codes (code, client_id, redirect_uri, code_challenge, expires_at, used)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(code.code, code.clientId, code.redirectUri, code.codeChallenge, code.expiresAt);
  return code;
}

export function getChallengeForCode(code: string): string | undefined {
  const now = Date.now();
  const row = getAuthDb().prepare(`
    SELECT code_challenge FROM auth_codes
    WHERE code = ? AND used = 0 AND expires_at > ?
  `).get(code, now) as { code_challenge: string } | undefined;
  return row?.code_challenge;
}

export function consumeAuthCode(code: string): AuthCode | undefined {
  const db = getAuthDb();
  const now = Date.now();

  const row = db.prepare(`
    SELECT * FROM auth_codes WHERE code = ? AND used = 0 AND expires_at > ?
  `).get(code, now) as {
    code: string; client_id: string; redirect_uri: string;
    code_challenge: string; expires_at: number; used: number;
  } | undefined;

  if (!row) return undefined;

  db.prepare('UPDATE auth_codes SET used = 1 WHERE code = ?').run(code);

  return {
    code: row.code,
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    expiresAt: row.expires_at,
    used: false,
  };
}

// ── Access Tokens ─────────────────────────────────────────────────────────────

export function saveToken(record: TokenRecord): void {
  getAuthDb().prepare(`
    INSERT INTO tokens (jti, client_id, expires_at, revoked) VALUES (?, ?, ?, 0)
  `).run(record.jti, record.clientId, record.expiresAt);
}

export function revokeToken(jti: string): void {
  getAuthDb().prepare('UPDATE tokens SET revoked = 1 WHERE jti = ?').run(jti);
}

export function isTokenRevoked(jti: string): boolean {
  const now = Date.now();
  const row = getAuthDb().prepare(`
    SELECT revoked FROM tokens WHERE jti = ? AND expires_at > ?
  `).get(jti, now) as { revoked: number } | undefined;
  if (!row) return true;
  return row.revoked === 1;
}

// ── Refresh Tokens ────────────────────────────────────────────────────────────

export function saveRefreshToken(record: RefreshTokenRecord): void {
  getAuthDb().prepare(`
    INSERT INTO refresh_tokens (token, client_id, expires_at, revoked) VALUES (?, ?, ?, 0)
  `).run(record.token, record.clientId, record.expiresAt);
}

export function revokeRefreshToken(token: string): void {
  getAuthDb().prepare('DELETE FROM refresh_tokens WHERE token = ?').run(token);
}

export function consumeRefreshToken(token: string): RefreshTokenRecord | undefined {
  const db = getAuthDb();
  const now = Date.now();

  const row = db.prepare(`
    SELECT * FROM refresh_tokens WHERE token = ? AND revoked = 0 AND expires_at > ?
  `).get(token, now) as {
    token: string; client_id: string; expires_at: number; revoked: number;
  } | undefined;

  if (!row) return undefined;

  // Rotate: delete consumed token so it can't be reused
  db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(token);

  return {
    token: row.token,
    clientId: row.client_id,
    expiresAt: row.expires_at,
    revoked: false,
  };
}
