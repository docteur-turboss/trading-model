import { jest } from '@jest/globals';
import { HttpClient } from '@trading-model/common/config/http-client';
import { Subscription } from '../../src/messaging/core/subscription';
import { Dispatcher } from '../../src/messaging/core/dispatcher';
import { mockServiceIdentity } from '../fixtures/broker.fixture';

export function createMockHttpClient(): jest.Mocked<HttpClient> {
  return {
    post: jest.fn<(url: string, data: unknown) => Promise<unknown>>().mockResolvedValue(undefined),
    get: jest.fn<(url: string) => Promise<unknown>>().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<HttpClient>;
}

export function createMockDispatcher(
  httpClient?: jest.Mocked<HttpClient>
): jest.Mocked<Dispatcher> {
  const client = httpClient ?? createMockHttpClient();
  return {
    registerSubscription:
      jest.fn<
        (params: {
          topic: string;
          callbackPath: string;
          consumerIdentity: typeof mockServiceIdentity;
        }) => void
      >(),
    dispatch: jest.fn<(message: unknown) => Promise<void>>().mockResolvedValue(undefined),
    unregisterSubscription: jest.fn<(params: { topic: string; instanceId: string }) => void>(),
  } as unknown as jest.Mocked<Dispatcher>;
}

export function createMockSubscription(
  overrides?: Partial<Subscription>
): jest.Mocked<Subscription> {
  return {
    topic: 'test.topic',
    callbackURL: 'message/callback',
    serviceIdentity: mockServiceIdentity,
    dispatch: jest
      .fn<(httpClient: HttpClient, message: unknown) => Promise<void>>()
      .mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<Subscription>;
}
