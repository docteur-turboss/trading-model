import { jest } from '@jest/globals';
import { createMockHttpClient as createCommonMockHttpClient } from '@trading-model/common/tests/helpers/mock-common';
import { Subscription } from '../../src/messaging/core/subscription';
import { Dispatcher } from '../../src/messaging/core/dispatcher';
import { mockServiceIdentity } from '../fixtures/broker.fixture';

export const createMockHttpClient = createCommonMockHttpClient;

export function createMockDispatcher(
  httpClient?: jest.Mocked<HttpClient>
): jest.Mocked<Dispatcher> {
  const client = httpClient ?? createMockHttpClient();
  return {
    publish: jest
      .fn<(payload: unknown, metadata: unknown) => Promise<void>>()
      .mockResolvedValue(undefined),
    subscribe:
      jest.fn<
        (params: {
          topic: string;
          callbackPath: string;
          consumerIdentity: typeof mockServiceIdentity;
        }) => void
      >(),
    registerSubscription:
      jest.fn<
        (params: {
          topic: string;
          callbackPath: string;
          consumerIdentity: typeof mockServiceIdentity;
        }) => void
      >(),
    dispatch: jest.fn<(message: unknown) => Promise<void>>().mockResolvedValue(undefined),
    unsubscribe: jest.fn<(params: { topic: string; instanceId: string }) => void>(),
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
