import { randomUUID } from 'crypto';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

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

const clients = new Map<string, OAuthClientInformationFull>();
const authCodes = new Map<string, AuthCode>();
const tokens = new Map<string, TokenRecord>();

export function saveClient(client: OAuthClientInformationFull): void {
  clients.set(client.client_id, client);
}

export function getClient(clientId: string): OAuthClientInformationFull | undefined {
  return clients.get(clientId);
}

export function registerClient(
  partial: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
): OAuthClientInformationFull {
  const client: OAuthClientInformationFull = {
    ...partial,
    client_id: randomUUID(),
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
  clients.set(client.client_id, client);
  return client;
}

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
  authCodes.set(code.code, code);
  return code;
}

/**
 * Returns the stored code challenge for a given auth code (without consuming it).
 * Used by the SDK to perform PKCE verification before calling exchangeAuthorizationCode.
 */
export function getChallengeForCode(code: string): string | undefined {
  return authCodes.get(code)?.codeChallenge;
}

/**
 * Atomically consume an auth code. Marks used immediately to prevent replay.
 * Returns undefined if not found, expired, or already used.
 */
export function consumeAuthCode(code: string): AuthCode | undefined {
  const record = authCodes.get(code);
  if (!record) return undefined;
  if (record.used) return undefined;
  if (Date.now() > record.expiresAt) {
    authCodes.delete(code);
    return undefined;
  }
  record.used = true;
  authCodes.delete(code);
  return record;
}

export function saveToken(record: TokenRecord): void {
  tokens.set(record.jti, record);
}

export function revokeToken(jti: string): void {
  const record = tokens.get(jti);
  if (record) {
    record.revoked = true;
  }
}

export function isTokenRevoked(jti: string): boolean {
  const record = tokens.get(jti);
  if (!record) return true;
  if (record.revoked) return true;
  if (Date.now() > record.expiresAt) {
    tokens.delete(jti);
    return true;
  }
  return false;
}
