import { describe, it, expect, jest } from '@jest/globals';

const mockRouter = {
  post: jest.fn(),
  get: jest.fn(),
};

jest.mock('express', () => ({
  Router: () => mockRouter,
}));

jest.mock('../../src/controllers/register.controller', () => ({
  register: 'register-handler',
  listServices: 'list-services-handler',
  getServiceInstances: 'get-service-instances-handler',
  getInstance: 'get-instance-handler',
}));

import { registryRoutes } from '../../src/routes/register.routes';

describe('registryRoutes', () => {
  it('should return a router and register all routes', () => {
    const router = registryRoutes();

    expect(router).toBe(mockRouter);
    expect(mockRouter.post).toHaveBeenCalledTimes(1);
    expect(mockRouter.post).toHaveBeenCalledWith('/register', 'register-handler');
    expect(mockRouter.get).toHaveBeenCalledTimes(3);
    expect(mockRouter.get).toHaveBeenCalledWith('/services', 'list-services-handler');
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/services/:serviceName',
      'get-service-instances-handler'
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/services/:serviceName/:instanceId',
      'get-instance-handler'
    );
  });
});
