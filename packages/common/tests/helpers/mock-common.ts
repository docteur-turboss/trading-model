import { jest } from "@jest/globals";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";

type MockHttpClient = { [K in keyof HttpClient]: jest.Mock };
/** Utility mock object for HttpClient-based tests. */
export function createMockHttpClient(): MockHttpClient {
	return {
		get: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
		post: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
	};
}
