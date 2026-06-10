import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createReq, createRes, createNext } from '../helpers/express';

jest.mock('@trading-model/common/middleware/catch-error', () => ({
  catchSync: (fn: any) => fn,
}));

jest.mock('@trading-model/common/middleware/response-exception', () => ({
  sendResponse: (data: any, status: number) => ({ status, data }),
}));

jest.mock('../../src/config/env', () => ({
  env: {
    AUTH_TOKEN_HEADER: 'x-api-key',
    AUTH_TOKENS: 'valid-token-1,valid-token-2',
  },
}));

import { authMiddleware } from '../../src/core/auth';

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject missing token with 401', async () => {
    const result = await authMiddleware(createReq({ headers: {} }), createRes(), createNext);
    expect(result).toMatchObject({ status: 401, data: { error: 'Missing authentication token' } });
  });

  it('should reject invalid token with 401', async () => {
    const result = await authMiddleware(
      createReq({ headers: { 'x-api-key': 'invalid' } }),
      createRes(),
      createNext,
    );
    expect(result).toMatchObject({ status: 401, data: { error: 'Invalid authentication token' } });
  });

  it('should accept valid token', async () => {
    const result = await authMiddleware(
      createReq({ headers: { 'x-api-key': 'valid-token-1' } }),
      createRes(),
      createNext,
    );
    expect(result).toBeUndefined();
  });

  it('should accept valid token from authorization header', async () => {
    const result = await authMiddleware(
      createReq({ headers: { authorization: 'valid-token-2' } }),
      createRes(),
      createNext,
    );
    expect(result).toBeUndefined();
  });
});
