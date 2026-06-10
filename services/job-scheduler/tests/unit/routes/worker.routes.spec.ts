import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../src/routes/worker.controller', () => ({
  createWorkerController: jest.fn(),
}));

const mockRouter = {
  post: jest.fn(),
  get: jest.fn(),
};

jest.mock('express', () => ({
  Router: () => mockRouter,
}));

import { workerRoutes } from '../../../src/routes/worker.routes';
import { createWorkerController } from '../../../src/routes/worker.controller';

describe('workerRoutes', () => {
  it('should register all worker routes', () => {
    const mockController = {
      register: 'register-handler',
      heartbeat: 'heartbeat-handler',
      list: 'list-handler',
    };
    (createWorkerController as jest.Mock).mockReturnValue(mockController);

    const router = workerRoutes(null as any);

    expect(router).toBe(mockRouter);
    expect(mockRouter.post).toHaveBeenCalledWith('/workers/register', 'register-handler');
    expect(mockRouter.post).toHaveBeenCalledWith('/workers/heartbeat', 'heartbeat-handler');
    expect(mockRouter.get).toHaveBeenCalledWith('/workers', 'list-handler');
  });
});
