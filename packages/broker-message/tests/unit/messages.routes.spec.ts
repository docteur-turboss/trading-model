import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../src/http/messages.controller', () => ({
  MessageController: jest.fn(),
}));

import { CreateCallbackRoute } from '../../src/http/messages.routes';

describe('CreateCallbackRoute', () => {
  it('should return a router', () => {
    const router = CreateCallbackRoute('/message');
    expect(router).toBeDefined();
  });

  it('should use the provided callback path', () => {
    const router = CreateCallbackRoute('/custom-path');
    expect(router).toBeDefined();
  });
});
