import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../src/controllers/job.controller', () => ({
  createJobController: jest.fn(),
}));

const mockRouter = {
  post: jest.fn(),
  get: jest.fn(),
};

jest.mock('express', () => ({
  Router: () => mockRouter,
}));

import { jobRoutes } from '../../../src/routes/job.routes';
import { createJobController } from '../../../src/controllers/job.controller';

describe('jobRoutes', () => {
  it('should register all job routes', () => {
    const mockController = {
      submit: 'submit-handler',
      getById: 'get-by-id-handler',
      cancel: 'cancel-handler',
    };
    (createJobController as jest.Mock).mockReturnValue(mockController);

    const router = jobRoutes(null as any);

    expect(router).toBe(mockRouter);
    expect(mockRouter.post).toHaveBeenCalledWith('/jobs', 'submit-handler');
    expect(mockRouter.get).toHaveBeenCalledWith('/jobs/:id', 'get-by-id-handler');
    expect(mockRouter.post).toHaveBeenCalledWith('/jobs/:id/cancel', 'cancel-handler');
  });
});
