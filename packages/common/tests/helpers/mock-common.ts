import { jest } from "@jest/globals";
import type { HttpClient } from "@trading-model/common/config/http-client";

/** Pre-configured mock logger for tests that need a logger. */
export function createMockLogger() {
	return {
		logger: {
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn(),
		},
	};
}

/** Pre-configured mock env object for discovery-server tests. */
export function createMockDiscoveryEnv(overrides?: Record<string, unknown>) {
	return {
		env: {
			CLEANUP_SERVICE_INTERVAL_MS: 5000,
			ERROR_URL_WEBHOOK: "https://hooks.example.com/error",
			...overrides,
		},
	};
}

type MockHttpClient = { [K in keyof HttpClient]: jest.Mock };
/** Utility mock object for HttpClient-based tests. */
export function createMockHttpClient(): MockHttpClient {
	return {
		get: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
		post: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
	};
}
