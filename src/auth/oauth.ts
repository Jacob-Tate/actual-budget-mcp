import crypto from 'crypto';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import type { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { config } from '../config';
import {
  getClient,
  registerClient,
  createAuthCode,
  getChallengeForCode,
  consumeAuthCode,
  saveToken,
  isTokenRevoked,
} from './store';

const TOKEN_TTL_SECONDS = 3600; // 1 hour

const clientsStore: OAuthRegisteredClientsStore = {
  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return getClient(clientId);
  },

  registerClient(
    partial: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
  ): OAuthClientInformationFull {
    return registerClient(partial);
  },
};

function renderLoginForm(params: {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  clientName?: string;
  error?: string;
}): string {
  const { clientId, redirectUri, state, codeChallenge, clientName, error } = params;
  const appName = clientName ?? 'an application';
  const errorHtml = error
    ? `<p class="error">${escapeHtml(error)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize – Actual Budget MCP</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 400px; margin: 80px auto; padding: 0 20px; color: #333; }
    h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
    p { color: #555; margin-bottom: 1.5rem; }
    label { display: block; font-weight: 500; margin-bottom: 0.3rem; }
    input[type=password] { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; box-sizing: border-box; }
    button { margin-top: 1rem; width: 100%; padding: 11px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .error { color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; padding: 10px; border-radius: 6px; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>Authorize Actual Budget</h1>
  <p>${escapeHtml(appName)} is requesting access to your budget data.</p>
  ${errorHtml}
  <form method="POST">
    <input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
    <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
    <input type="hidden" name="state" value="${escapeHtml(state ?? '')}">
    <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
    <label for="password">MCP Server Password</label>
    <input type="password" id="password" name="password" required autofocus placeholder="Enter your MCP password">
    <button type="submit">Authorize</button>
  </form>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function mintAccessToken(clientId: string): { token: string; jti: string; expiresAt: number } {
  const jti = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const token = jwt.sign({ sub: 'user', clientId }, config.jwtSecret, {
    jwtid: jti,
    expiresIn: TOKEN_TTL_SECONDS,
  });
  saveToken({ jti, clientId, expiresAt: expiresAt * 1000, revoked: false });
  return { token, jti, expiresAt };
}

export const oauthProvider: OAuthServerProvider = {
  clientsStore,

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const req = res.req;

    if (req.method === 'POST') {
      const password = req.body?.password as string | undefined;
      const isValid = password && crypto.timingSafeEqual(
        Buffer.from(password),
        Buffer.from(config.mcpAuthPassword),
      );

      if (!isValid) {
        res.send(renderLoginForm({
          clientId: client.client_id,
          redirectUri: params.redirectUri,
          state: params.state,
          codeChallenge: params.codeChallenge,
          clientName: client.client_name,
          error: 'Incorrect password. Please try again.',
        }));
        return;
      }

      const authCode = createAuthCode({
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
      });

      const redirectUrl = new URL(params.redirectUri);
      redirectUrl.searchParams.set('code', authCode.code);
      if (params.state) {
        redirectUrl.searchParams.set('state', params.state);
      }
      res.redirect(302, redirectUrl.toString());
      return;
    }

    // GET: render login form
    res.send(renderLoginForm({
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      state: params.state,
      codeChallenge: params.codeChallenge,
      clientName: client.client_name,
    }));
  },

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const challenge = getChallengeForCode(authorizationCode);
    if (!challenge) {
      throw new Error('Authorization code not found or expired');
    }
    return challenge;
  },

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<OAuthTokens> {
    const record = consumeAuthCode(authorizationCode);
    if (!record) {
      throw new Error('Authorization code is invalid, expired, or already used');
    }

    const { token } = mintAccessToken(client.client_id);
    return {
      access_token: token,
      token_type: 'bearer',
      expires_in: TOKEN_TTL_SECONDS,
    };
  },

  async exchangeRefreshToken(): Promise<OAuthTokens> {
    throw new Error('Refresh tokens are not supported');
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token verification failed';
      throw new Error(`Invalid access token: ${message}`);
    }

    const jti = payload['jti'];
    if (typeof jti !== 'string' || isTokenRevoked(jti)) {
      throw new Error('Token has been revoked or is invalid');
    }

    return {
      token,
      clientId: payload['clientId'] as string,
      scopes: [],
      expiresAt: payload['exp'],
    };
  },
};
