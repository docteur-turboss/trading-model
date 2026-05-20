import { describe, it, expect, jest } from '@jest/globals';

const mockRouter = {
  post: jest.fn(),
  get: jest.fn(),
};

jest.mock('express', () => ({
  Router: () => mockRouter,
}));

jest.mock('../../src/controllers/heartbeat.controller', () => ({
  heartbeat: 'heartbeat-handler',
  rotateToken: 'rotate-token-handler',
}));

import { heartbeatRoutes } from '../../src/routes/heartbeat.routes';

describe('heartbeatRoutes', () => {
  it('should return a router and register all routes', () => {
    const router = heartbeatRoutes();

    expect(router).toBe(mockRouter);
    expect(mockRouter.post).toHaveBeenCalledTimes(2);
    expect(mockRouter.post).toHaveBeenCalledWith('/heartbeat', 'heartbeat-handler');
    expect(mockRouter.post).toHaveBeenCalledWith('/token/rotate', 'rotate-token-handler');
  });
});
