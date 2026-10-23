import { jest } from "@jest/globals";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import type { Dispatcher } from "../../src/application/services/dispatcher";
import type { SubscriptionParams } from "../../src/domain/messaging-types";

type MockHttpClient = { [K in keyof HttpClient]: jest.Mock };

/** Utility mock object for HttpClient-based tests. */
export function createMockHttpClient(): MockHttpClient {
	return {
		get: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
		post: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
	};
}

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
