import { describe, it, expect, beforeEach } from '@jest/globals';
import { BrokerRoutes } from '../../../../src/messaging/transport/http.routes';

import { createMockDispatcher } from '../../../helpers/broker.helper';

describe('BrokerRoutes', () => {
  let router: ReturnType<typeof BrokerRoutes>;

  beforeEach(() => {
    const mockDispatcher = createMockDispatcher();
    router = BrokerRoutes(mockDispatcher as never);
  });

  it('should return an Express Router', () => {
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
  });

  it('should define POST /message route', () => {
    const route = router.stack.find(
      (r: { route?: { path?: string } }) => r.route?.path === '/message'
    );
    expect(route).toBeDefined();
  });

  it('should define POST /subscription route', () => {
    const route = router.stack.find(
      (r: { route?: { path?: string } }) => r.route?.path === '/subscription'
    );
    expect(route).toBeDefined();
  });

  it('should define DELETE /subscription route', () => {
    const route = router.stack.find(
      (r: { route?: { path?: string } }) => r.route?.path === '/subscription'
    );
    expect(route).toBeDefined();
  });

  it('should have exactly 3 routes', () => {
    expect(router.stack.length).toBe(3);
  });
});
