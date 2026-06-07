import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Request, Response } from 'express';
import {
  SubscriptionToATopic,
  DeleteASubscription,
  PublishAMessage,
} from '../../../../src/messaging/transport/http.controller';
import { Broker } from '../../../../src/messaging/core/broker';
import { createMockDispatcher } from '../../../helpers/broker.helper';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';

jest.mock('@trading-model/common/middleware/catch-error', () => ({
  catchSync:
    (fn: (...args: unknown[]) => unknown) =>
    async (...args: unknown[]): Promise<void> => {
      try {
        await fn(...args);
      } catch (e) {
        const next = args[2] as (err?: unknown) => void;
        next(e);
      }
    },
}));

describe('HTTP Controller', () => {
  let broker: Broker;
  let mockDispatcher: ReturnType<typeof createMockDispatcher>;

  beforeEach(() => {
    mockDispatcher = createMockDispatcher();
    broker = new Broker(mockDispatcher as never);
  });

  describe('SubscriptionToATopic', () => {
    it('should call broker.subscribe with valid body', async () => {
      const handler = SubscriptionToATopic(broker);
      const req = {
        body: {
          topic: 'test.topic',
          callbackPath: 'message/callback',
          consumerIdentity: {
            serviceName: ServiceInstanceName.FinancialScraperService,
            instanceId: 'instance-1',
          },
        },
      } as Request;

      await handler(req, {} as Response, jest.fn());

      expect(mockDispatcher.registerSubscription).toHaveBeenCalledWith(req.body);
    });

    it('should return error on invalid body', async () => {
      const handler = SubscriptionToATopic(broker);

      await handler({ body: { topic: '' } } as Request, {} as Response, jest.fn());

      expect(mockDispatcher.registerSubscription).not.toHaveBeenCalled();
    });
  });

  describe('DeleteASubscription', () => {
    it('should call broker.unsubscribe with valid body', async () => {
      const handler = DeleteASubscription(broker);
      const req = {
        body: { topic: 'test.topic', instanceId: 'instance-1' },
      } as Request;

      await handler(req, {} as Response, jest.fn());

      expect(mockDispatcher.unregisterSubscription).toHaveBeenCalledWith(req.body);
    });

    it('should return error on invalid body', async () => {
      const handler = DeleteASubscription(broker);

      await handler({ body: { topic: '' } } as Request, {} as Response, jest.fn());

      expect(mockDispatcher.unregisterSubscription).not.toHaveBeenCalled();
    });
  });

  describe('PublishAMessage', () => {
    it('should call broker.publish with valid body', async () => {
      const handler = PublishAMessage(broker);
      const req = {
        body: {
          payload: { key: 'value' },
          metadata: {
            schemaVersion: '1.0',
            eventType: 'TestEvent',
            topic: 'test.topic',
            publisher: {
              serviceName: ServiceInstanceName.FinancialScraperService,
              instanceId: 'instance-1',
            },
          },
        },
      } as Request;

      await handler(req, {} as Response, jest.fn());

      expect(mockDispatcher.dispatch).toHaveBeenCalled();
    });

    it('should return error on invalid body', async () => {
      const handler = PublishAMessage(broker);
      const req = { body: { payload: {} } } as Request;

      await handler(req, {} as Response, jest.fn());

      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
    });
  });
});
