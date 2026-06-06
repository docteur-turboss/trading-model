import { unlink, writeFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import { DeliveryMode } from '@trading-model/common/config/delivery-mode.types';
import { DeadLetterError, NackError } from '@trading-model/common/utils/errors';
import { Subscription } from '../../../../src/messaging/core/subscription';
import { DqlRepository } from '../../../../src/messaging/core/dlq-repository';
import { createMockHttpClient } from '../../../helpers/broker.helper';
import { createMockMessage, mockServiceIdentity } from '../../../fixtures/broker.fixture';

jest.mock('@trading-model/common/utils/sleep', () => ({
  sleep: jest.fn(() => Promise.resolve()),
}));

jest.mock('config/address-manager', () => ({
  findAService: jest
    .fn<() => Promise<{ ip: string; port: number }>>()
    .mockResolvedValue({ ip: '10.0.0.1', port: 8444 }),
}));

describe('Subscription', () => {
  let mockHttpClient: ReturnType<typeof createMockHttpClient>;
  let subscription: Subscription;
  let dqlRepository: DqlRepository;
  const dlqFilePath = join(tmpdir(), `dlq-test-sub-${Date.now()}.jsonl`);

  beforeEach(async () => {
    mockHttpClient = createMockHttpClient();
    dqlRepository = new DqlRepository(dlqFilePath);
    subscription = new Subscription(
      'test.topic',
      'message/callback',
      mockServiceIdentity,
      dqlRepository
    );
    if (existsSync(dlqFilePath)) {
      await writeFile(dlqFilePath, '', 'utf-8');
    }
  });

  afterAll(async () => {
    if (existsSync(dlqFilePath)) {
      await unlink(dlqFilePath);
    }
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

    it('should retry with exponential backoff on generic error with AT_LEAST_ONCE mode', async () => {
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

      const content = readFileSync(dlqFilePath, 'utf-8').trim();
      const entry = JSON.parse(content);
      expect(entry.reason).toBe('Unrecoverable');
      expect(entry.message.payload).toBe('payload');
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

      const content = readFileSync(dlqFilePath, 'utf-8').trim();
      const entry = JSON.parse(content);
      expect(entry.reason).toBe('TTL_EXPIRED');
      expect(entry.message.payload).toBe('payload');
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

    it('should route to DLQ when max retries exceeded', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Transient error'));

      const message = createMockMessage('payload', {
        delivery: { mode: DeliveryMode.AT_LEAST_ONCE, ttl: 60000 },
      });

      await subscription.dispatch(mockHttpClient as never, message);

      const content = readFileSync(dlqFilePath, 'utf-8').trim();
      const entry = JSON.parse(content);
      expect(entry.reason).toBe('MAX_RETRIES_EXCEEDED');
    });

    it('should open circuit breaker after threshold failures and reject directly to DLQ', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Service down'));

      const message = createMockMessage('payload', {
        delivery: { mode: DeliveryMode.AT_LEAST_ONCE, ttl: 60000 },
      });

      // exhaust retries 5 times to reach CIRCUIT_BREAKER_THRESHOLD
      for (let i = 0; i < 5; i++) {
        await subscription.dispatch(mockHttpClient as never, message);
      }

      // 6th dispatch — circuit is open, goes directly to DLQ with CIRCUIT_OPEN
      await subscription.dispatch(mockHttpClient as never, message);

      const content = readFileSync(dlqFilePath, 'utf-8').trim();
      const lines = content.split('\n');
      const lastEntry = JSON.parse(lines[lines.length - 1]);
      expect(lastEntry.reason).toBe('CIRCUIT_OPEN');
    });

    it('should reset circuit breaker on successful delivery', async () => {
      mockHttpClient.post
        .mockRejectedValue(new Error('Service down'))
        .mockResolvedValueOnce(undefined);

      const message = createMockMessage('payload', {
        delivery: { mode: DeliveryMode.AT_LEAST_ONCE, ttl: 60000 },
      });

      // first message — fails (retries exhausted), failureCount = 1
      await subscription.dispatch(mockHttpClient as never, message);

      // second message — succeeds, failureCount resets to 0
      mockHttpClient.post.mockReset();
      mockHttpClient.post.mockResolvedValue(undefined);

      await subscription.dispatch(mockHttpClient as never, message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);

      // third message — also succeeds, confirming failureCount was reset
      await subscription.dispatch(mockHttpClient as never, message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(2);
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
