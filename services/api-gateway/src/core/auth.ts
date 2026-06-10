import { RequestHandler } from 'express';

import { catchSync } from '@trading-model/common/middleware/catch-error';
import { sendResponse } from '@trading-model/common/middleware/response-exception';

import { env } from '../config/env';

const validTokens = new Set(
  env.AUTH_TOKENS
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0)
);

export interface AuthRequest {
  clientIdentity: string;
}

export const authMiddleware: RequestHandler = catchSync(async req => {
  const tokenHeader = env.AUTH_TOKEN_HEADER.toLowerCase();
  const token = req.headers[tokenHeader] ?? req.headers['authorization'];

  if (!token || typeof token !== 'string') {
    return sendResponse({ error: 'Missing authentication token' }, 401);
  }

  if (validTokens.size > 0 && !validTokens.has(token)) {
    return sendResponse({ error: 'Invalid authentication token' }, 401);
  }

  (req as unknown as AuthRequest).clientIdentity = `client:${token.slice(0, 8)}`;
});
