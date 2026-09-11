import { jest } from "@jest/globals";
import { createMockHttpClient as createCommonMockHttpClient } from "@trading-model/common/tests/helpers/mock-common";
import type { Dispatcher } from "../../src/messaging/core/dispatcher";
import type { SubscriptionParams } from "../../src/messaging/core/messaging-types";

export const createMockHttpClient = createCommonMockHttpClient;

export function createMockDispatcher(
	_httpClient?: jest.Mocked<HttpClient>
): jest.Mocked<Dispatcher> {
	return {
		publish: jest
			.fn<(payload: unknown, metadata: unknown) => Promise<void>>()
			.mockResolvedValue(undefined),
		subscribe: jest.fn<(params: SubscriptionParams) => void>(),
		dispatch: jest
			.fn<(message: unknown) => Promise<void>>()
			.mockResolvedValue(undefined),
		unsubscribe:
			jest.fn<(params: { topic: string; instanceId: string }) => void>(),
	} as unknown as jest.Mocked<Dispatcher>;
}
