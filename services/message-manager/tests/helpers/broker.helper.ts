import { jest } from "@jest/globals";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import type { Dispatcher } from "../../src/application/services/dispatcher";
import type { SubscriptionParams } from "../../src/domain/messaging-types";

type MockHttpClient = {
	[K in keyof HttpClient]: jest.Mock<(...args: any[]) => any>;
};

/** Utility mock object for HttpClient-based tests. */
export function createMockHttpClient(): MockHttpClient {
	return {
		get: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
		post: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
		delete: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
	};
}

export function createMockDispatcher(
	_httpClient?: jest.Mocked<HttpClient>
): jest.Mocked<Dispatcher> {
	return {
		publish: jest
			.fn<(payload: unknown, metadata: unknown) => Promise<string>>()
			.mockResolvedValue("message-id"),
		subscribe: jest
			.fn<(params: SubscriptionParams) => Promise<void>>()
			.mockResolvedValue(undefined),
		dispatch: jest
			.fn<(message: unknown) => Promise<void>>()
			.mockResolvedValue(undefined),
		unsubscribe: jest
			.fn<(params: { topic: string; instanceId: string }) => Promise<void>>()
			.mockResolvedValue(undefined),
	} as unknown as jest.Mocked<Dispatcher>;
}
