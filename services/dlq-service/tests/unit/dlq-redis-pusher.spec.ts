import { describe, expect, it, jest } from "@jest/globals";

const MOCK_PUSH = jest.fn();
jest.mock("../../src/config/redis-queue", () => ({
	dlqRedisQueue: { push: MOCK_PUSH },
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("dlq-redis-pusher", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should push entry id to redis queue", async () => {
		MOCK_PUSH.mockResolvedValue(true);

		const { pushToRedisQueue } = jest.requireActual(
			"../../src/dlq/dlq-redis-pusher"
		) as { pushToRedisQueue: (id: string) => Promise<void> };
		await pushToRedisQueue("test-id-123");

		expect(MOCK_PUSH).toHaveBeenCalledWith("test-id-123");
	});

	it("should handle push errors gracefully", async () => {
		MOCK_PUSH.mockRejectedValue(new Error("Redis unavailable"));

		const { pushToRedisQueue } = jest.requireActual(
			"../../src/dlq/dlq-redis-pusher"
		) as { pushToRedisQueue: (id: string) => Promise<void> };
		await expect(pushToRedisQueue("test-id")).resolves.toBeUndefined();
	});
});
