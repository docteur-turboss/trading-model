import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockRouter = {
  get: jest.fn(),
};
const mockController = { ping: jest.fn(), health: jest.fn() };

jest.mock('express', () => ({
  Router: jest.fn(() => mockRouter),
}));

jest.mock('../../../src/routes/health.controller', () => ({
  createHealthController: jest.fn(() => mockController),
}));

import { healthRoutes } from '../../../src/routes/health.routes';

describe('healthRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register GET /ping and GET /health', () => {
    const queue = {} as any;
    const backPressure = {} as any;
    const workers = {} as any;

    const router = healthRoutes(queue, backPressure, workers);

    expect(router).toBe(mockRouter);
    expect(mockRouter.get).toHaveBeenCalledWith('/ping', mockController.ping);
    expect(mockRouter.get).toHaveBeenCalledWith('/health', mockController.health);
  });
});
