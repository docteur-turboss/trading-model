import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { DeliveryMode } from '@trading-model/common/config/delivery-mode.types';
import { DeadLetterError, NackError } from '@trading-model/common/utils/errors';
import { Subscription } from '../../../../src/messaging/core/subscription';
import { createMockHttpClient } from '../../../helpers/broker.helper';
import { createMockMessage, mockServiceIdentity } from '../../../fixtures/broker.fixture';

jest.mock('config/address-manager', () => ({
  findAService: jest
    .fn<() => Promise<{ ip: string; port: number }>>()
    .mockResolvedValue({ ip: '10.0.0.1', port: 8444 }),
}));

describe('Subscription', () => {
  let mockHttpClient: ReturnType<typeof createMockHttpClient>;
  let subscription: Subscription;

  beforeEach(() => {
    mockHttpClient = createMockHttpClient();
    subscription = new Subscription('test.topic', 'message/callback', mockServiceIdentity);
  });

  describe('dispatch', () => {
    it('should deliver message via HTTP POST on success', async () => {
      mockHttpClient.post.mockResolvedValue(undefined);

      const message = createMockMessage('payload');
      await subscription.dispatch(mockHttpClient as never, message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
      const [targetUrl, body] = mockHttpClient.post.mock.calls[0] as [string, unknown];

      expect(targetUrl).toContain('10.0.0.1');
      expect(targetUrl).toContain('8444');
      expect(targetUrl).toContain('message/callback');
      expect(body).toBeDefined();
    });

    it('should retry on generic error with AT_LEAST_ONCE mode', async () => {
      mockHttpClient.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      const message = createMockMessage('payload', {
        delivery: { mode: DeliveryMode.AT_LEAST_ONCE, ttl: 60000 },
      });
      await subscription.dispatch(mockHttpClient as never, message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(3);
    });

    it('should stop retrying and send to DLQ on DeadLetterError', async () => {
      mockHttpClient.post.mockRejectedValue(new DeadLetterError('Unrecoverable'));

      const message = createMockMessage('payload', {
        delivery: { mode: DeliveryMode.AT_LEAST_ONCE, ttl: 60000 },
      });
      await subscription.dispatch(mockHttpClient as never, message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });

    it('should stop retrying and send to DLQ on TTL expiration', async () => {
      const mockDateNow = jest
        .spyOn(Date, 'now')
        .mockReturnValue(new Date('2026-02-01T00:00:00Z').getTime());

      mockHttpClient.post.mockRejectedValue(new Error('Timeout'));

      const message = createMockMessage('payload', {
        emittedAt: new Date('2026-01-01T00:00:00Z'),
        delivery: { mode: DeliveryMode.AT_LEAST_ONCE, ttl: 1 },
      });
      await subscription.dispatch(mockHttpClient as never, message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
      mockDateNow.mockRestore();
    });

    it('should not retry on NackError with AT_MOST_ONCE mode', async () => {
      mockHttpClient.post.mockRejectedValue(new NackError('Consumer nack'));

      const message = createMockMessage('payload', {
        delivery: { mode: DeliveryMode.AT_MOST_ONCE, ttl: 60000 },
      });
      await subscription.dispatch(mockHttpClient as never, message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });

    it('should stop after first attempt with EXACTLY_ONCE mode', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Transient error'));

      const message = createMockMessage('payload', {
        delivery: { mode: DeliveryMode.EXACTLY_ONCE, ttl: 60000 },
      });
      await subscription.dispatch(mockHttpClient as never, message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });

    it('should succeed on first attempt with AT_MOST_ONCE mode', async () => {
      mockHttpClient.post.mockResolvedValue(undefined);

      const message = createMockMessage('payload', {
        delivery: { mode: DeliveryMode.AT_MOST_ONCE, ttl: 60000 },
      });
      await subscription.dispatch(mockHttpClient as never, message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });

    it('should succeed on first attempt with EXACTLY_ONCE mode', async () => {
      mockHttpClient.post.mockResolvedValue(undefined);

      const message = createMockMessage('payload', {
        delivery: { mode: DeliveryMode.EXACTLY_ONCE, ttl: 60000 },
      });
      await subscription.dispatch(mockHttpClient as never, message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });

    it('should include delivery attempt context in POST body', async () => {
      mockHttpClient.post.mockResolvedValue(undefined);

      const message = createMockMessage('payload');
      await subscription.dispatch(mockHttpClient as never, message);

      const [, body] = mockHttpClient.post.mock.calls[0] as [
        string,
        { message: unknown; context: { deliveryAttempt: number } },
      ];

      expect(body.context).toBeDefined();
      expect(body.context.deliveryAttempt).toBe(0);
      expect(body.message).toEqual(message);
    });

    it('should use default TTL=0 and AT_LEAST_ONCE when delivery is undefined', async () => {
      mockHttpClient.post.mockResolvedValue(undefined);

      const message = createMockMessage('payload', { delivery: undefined });
      await subscription.dispatch(mockHttpClient as never, message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });

    it('should fallback emittedAt to 0 when not provided', async () => {
      mockHttpClient.post.mockResolvedValue(undefined);

      const message = createMockMessage('payload', { delivery: undefined });
      (message.metadata as any).emittedAt = undefined;
      await subscription.dispatch(mockHttpClient as never, message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('topic and identity', () => {
    it('should expose topic, callbackURL, and serviceIdentity', () => {
      expect(subscription.topic).toBe('test.topic');
      expect(subscription.callbackURL).toBe('message/callback');
      expect(subscription.serviceIdentity).toEqual(mockServiceIdentity);
    });
  });
});
