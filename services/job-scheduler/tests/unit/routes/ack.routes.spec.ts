import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../src/controllers/ack.controller', () => ({
  createAckController: jest.fn(),
}));

const mockRouter = {
  post: jest.fn(),
};

jest.mock('express', () => ({
  Router: () => mockRouter,
}));

import { ackRoutes } from '../../../src/routes/ack.routes';
import { createAckController } from '../../../src/controllers/ack.controller';

describe('ackRoutes', () => {
  it('should register all ack routes', () => {
    const mockController = {
      ack: 'ack-handler',
      complete: 'complete-handler',
      fail: 'fail-handler',
    };
    (createAckController as jest.Mock).mockReturnValue(mockController);

    const router = ackRoutes(null as any);

    expect(router).toBe(mockRouter);
    expect(mockRouter.post).toHaveBeenCalledWith('/jobs/:id/ack', 'ack-handler');
    expect(mockRouter.post).toHaveBeenCalledWith('/jobs/:id/complete', 'complete-handler');
    expect(mockRouter.post).toHaveBeenCalledWith('/jobs/:id/fail', 'fail-handler');
  });
});
