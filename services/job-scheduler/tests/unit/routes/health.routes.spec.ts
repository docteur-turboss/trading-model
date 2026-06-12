import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../src/controllers/health.controller', () => ({
  createHealthController: jest.fn(),
}));

const mockRouter = {
  get: jest.fn(),
};

jest.mock('express', () => ({
  Router: () => mockRouter,
}));

import { healthRoutes } from '../../../src/routes/health.routes';
import { createHealthController } from '../../../src/controllers/health.controller';

describe('healthRoutes', () => {
  it('should register all health routes', () => {
    const mockController = {
      ping: 'ping-handler',
      health: 'health-handler',
    };
    (createHealthController as jest.Mock).mockReturnValue(mockController);

    const router = healthRoutes(null as any, null as any, null as any);

    expect(router).toBe(mockRouter);
    expect(mockRouter.get).toHaveBeenCalledWith('/ping', 'ping-handler');
    expect(mockRouter.get).toHaveBeenCalledWith('/health', 'health-handler');
  });
});
