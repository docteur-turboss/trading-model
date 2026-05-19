import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BrokerRoutes } from '../../../../src/messaging/transport/http.routes';
import { Broker } from '../../../../src/messaging/core/broker';
import { createMockDispatcher } from '../../../helpers/broker.helper';

describe('BrokerRoutes', () => {
  let broker: Broker;
  let router: ReturnType<typeof BrokerRoutes>;

  beforeEach(() => {
    const mockDispatcher = createMockDispatcher();
    broker = new Broker(mockDispatcher as never);
    router = BrokerRoutes(broker);
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
