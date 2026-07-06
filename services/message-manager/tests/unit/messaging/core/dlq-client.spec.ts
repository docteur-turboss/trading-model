import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../../src/config/env", () => ({
	ENV: {
		DLQ_AUTH_HMAC_SECRET: "test-secret-key-12345678",
		DLQ_SERVICE_URL: "https://dlq-service:3000",
	},
}));

jest.mock("../../../../src/config/metrics", () => ({
	MESSAGES_DLQ_ERROR_TOTAL: { inc: jest.fn() },
}));

import type { HttpClient } from "@trading-model/common/config/http-client";
import { DlqServiceClient } from "../../../../src/messaging/core/dlq-client";

function createMockHttpClient(): jest.Mocked<HttpClient> {
	return {
		post: jest
			.fn<
				(
					url: string,
					body: unknown,
					opts?: Record<string, unknown>
				) => Promise<unknown>
			>()
			.mockResolvedValue(undefined),
		get: jest
			.fn<
				<T>(
					url: string,
					opts?: Record<string, unknown>
				) => Promise<T | undefined>
			>()
			.mockResolvedValue(undefined),
	} as unknown as jest.Mocked<HttpClient>;
}

describe("DlqServiceClient enabled", () => {
	let mockHttpClient: jest.Mocked<HttpClient>;
	let client: DlqServiceClient;

	beforeEach(() => {
		mockHttpClient = createMockHttpClient();
		client = new DlqServiceClient(mockHttpClient);
	});

	it("should be enabled when DLQ_SERVICE_URL is set", () => {
		expect(client.isEnabled).toBe(true);
	});

	it("should send entry to DLQ service", async () => {
		const entry = {
			message: { payload: "test" },
			reason: "test-reason",
			deliveryAttempt: 1,
			timestamp: "2026-01-01T00:00:00.000Z",
		};

		await client.send(entry);

		expect(mockHttpClient.post).toHaveBeenCalledWith(
			"https://dlq-service:3000/dlq",
			entry,
			expect.objectContaining({ timeoutMs: 5000 })
		);
	});

	it("should throw after max retries", async () => {
		mockHttpClient.post.mockRejectedValue(new Error("network error"));

		await expect(
			client.send(
				{
					message: "test",
					reason: "test-reason",
					deliveryAttempt: 1,
					timestamp: "2026-01-01T00:00:00.000Z",
				},
				{ attempt: 1, maxRetries: 1 }
			)
		).rejects.toThrow("Failed to send DLQ entry");
	});

	it("should replay entries from DLQ service", async () => {
		mockHttpClient.get.mockResolvedValue({
			entries: [
				{
					message: { payload: "test" },
					reason: "test-reason",
					deliveryAttempt: 1,
					timestamp: "2026-01-01T00:00:00.000Z",
				},
			],
		});

		const entries = await client.replay("test.topic", 10);
		expect(entries).toHaveLength(1);
		expect(entries[0].reason).toBe("test-reason");
	});

	it("should return empty on replay error", async () => {
		mockHttpClient.get.mockRejectedValue(new Error("network error"));

		const entries = await client.replay("test.topic", 10);
		expect(entries).toEqual([]);
	});

	it("should delete entries from DLQ service", async () => {
		await client.delete(["entry-1", "entry-2"]);

		expect(mockHttpClient.post).toHaveBeenCalledWith(
			"https://dlq-service:3000/dlq/delete",
			{ ids: ["entry-1", "entry-2"] },
			expect.objectContaining({ timeoutMs: 5000 })
		);
	});

	it("should handle delete error gracefully", async () => {
		mockHttpClient.post.mockRejectedValue(new Error("network error"));

		await expect(client.delete(["entry-1"])).resolves.toBeUndefined();
	});

	it("should replay without limit and topic", async () => {
		mockHttpClient.get.mockResolvedValue({ entries: [] });

		const entries = await client.replay();
		expect(entries).toEqual([]);
	});
});
