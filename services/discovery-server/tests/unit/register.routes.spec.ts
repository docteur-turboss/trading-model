import { describe, it, expect, jest } from '@jest/globals';

import { ServiceRegistry } from '../../src/core/service-registry';

const mockRouter = {
  post: jest.fn(),
  get: jest.fn(),
};

jest.mock('express', () => ({
  Router: () => mockRouter,
}));

jest.mock('../../src/controllers/register.controller', () => ({
  createRegisterController: jest.fn(),
}));

import { registryRoutes } from '../../src/routes/register.routes';
import { createRegisterController } from '../../src/controllers/register.controller';

describe('registryRoutes', () => {
  it('should return a router and register all routes', () => {
    const registry = new ServiceRegistry();
    const mockController = {
      register: 'register-handler',
      listServices: 'list-services-handler',
      getServiceInstances: 'get-service-instances-handler',
      getInstance: 'get-instance-handler',
    };
    (createRegisterController as jest.Mock).mockReturnValue(mockController);

    const router = registryRoutes(registry);

    expect(router).toBe(mockRouter);
    expect(mockRouter.post).toHaveBeenCalledTimes(1);
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/register',
      expect.any(Function),
      'register-handler'
    );
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
