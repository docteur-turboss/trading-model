import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../../src/config/env", () => ({
	ENV: {
		DLQ_AUTH_HMAC_SECRET: undefined,
		DLQ_SERVICE_URL: "",
	},
}));

jest.mock("../../../../src/config/metrics", () => ({
	MESSAGES_DLQ_ERROR_TOTAL: { inc: jest.fn() },
}));

import type { HttpClient } from "@trading-model/common/config/http-client";
import { DlqServiceClient } from "../../../../src/messaging/core/dlq-client";

function createMockHttpClient(): jest.Mocked<HttpClient> {
	return {
		post: jest.fn<
			(
				url: string,
				body: unknown,
				opts?: Record<string, unknown>
			) => Promise<unknown>
		>(),
		get: jest.fn<
			<T>(url: string, opts?: Record<string, unknown>) => Promise<T | undefined>
		>(),
	} as unknown as jest.Mocked<HttpClient>;
}

describe("DlqServiceClient disabled", () => {
	let mockHttpClient: jest.Mocked<HttpClient>;
	let client: DlqServiceClient;

	beforeEach(() => {
		mockHttpClient = createMockHttpClient();
		client = new DlqServiceClient(mockHttpClient);
	});

	it("should be disabled when DLQ_SERVICE_URL is empty", () => {
		expect(client.isEnabled).toBe(false);
	});

	it("should warn and skip send when not configured", async () => {
		const entry = {
			message: { payload: "test" },
			reason: "test-reason",
			deliveryAttempt: 1,
			timestamp: "2026-01-01T00:00:00.000Z",
		};

		await client.send(entry);
		expect(mockHttpClient.post).not.toHaveBeenCalled();
	});

	it("should return empty on replay when not configured", async () => {
		const entries = await client.replay("test.topic", 10);
		expect(entries).toEqual([]);
	});

	it("should do nothing on delete when not configured", async () => {
		await client.delete(["entry-1"]);
		expect(mockHttpClient.post).not.toHaveBeenCalled();
	});
});
