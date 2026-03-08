import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { isTokenRevoked } from './store';

interface JwtPayload {
  sub: string;
  jti: string;
  clientId: string;
  iat: number;
  exp: number;
}

export function bearerAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'unauthorized',
      error_description: 'Bearer token required',
    });
    return;
  }

  const token = authHeader.slice(7);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token verification failed';
    res.status(401).json({
      error: 'invalid_token',
      error_description: message,
    });
    return;
  }

  if (isTokenRevoked(payload.jti)) {
    res.status(401).json({
      error: 'invalid_token',
      error_description: 'Token has been revoked',
    });
    return;
  }

  next();
}
