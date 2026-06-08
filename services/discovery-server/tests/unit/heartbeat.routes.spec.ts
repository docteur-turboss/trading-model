import { describe, it, expect, jest } from '@jest/globals';

import { ServiceRegistry } from '../../src/core/service-registry';

const mockRouter = {
  post: jest.fn(),
  get: jest.fn(),
};

jest.mock('express', () => ({
  Router: () => mockRouter,
}));

jest.mock('../../src/controllers/heartbeat.controller', () => ({
  createHeartbeatController: jest.fn(),
}));

import { heartbeatRoutes } from '../../src/routes/heartbeat.routes';
import { createHeartbeatController } from '../../src/controllers/heartbeat.controller';

describe('heartbeatRoutes', () => {
  it('should return a router and register all routes', () => {
    const registry = new ServiceRegistry();
    const mockController = {
      heartbeat: 'heartbeat-handler',
      rotateToken: 'rotate-token-handler',
    };
    (createHeartbeatController as jest.Mock).mockReturnValue(mockController);

    const router = heartbeatRoutes(registry);

    expect(router).toBe(mockRouter);
    expect(mockRouter.post).toHaveBeenCalledTimes(2);
    expect(mockRouter.post).toHaveBeenCalledWith('/heartbeat', expect.any(Function), 'heartbeat-handler');
    expect(mockRouter.post).toHaveBeenCalledWith('/token/rotate', expect.any(Function), 'rotate-token-handler');
  });
});
