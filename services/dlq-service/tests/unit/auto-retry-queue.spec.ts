import { describe, expect, it, jest } from "@jest/globals";

const MOCK_LIST_QUEUABLE = jest.fn();
const MOCK_PUSH = jest.fn();

jest.mock("../../src/dlq/repository", () => ({
	dlqRepository: { listQueuable: MOCK_LIST_QUEUABLE },
}));

jest.mock("../../src/config/redis-queue", () => ({
	dlqRedisQueue: { push: MOCK_PUSH },
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("auto-retry-queue", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should push queuable entries to Redis", async () => {
		MOCK_LIST_QUEUABLE.mockResolvedValue(["id1", "id2"]);

		const { rebuildQueueFromMongo } = jest.requireActual(
			"../../src/dlq/auto-retry-queue"
		) as { rebuildQueueFromMongo: () => Promise<void> };
		await rebuildQueueFromMongo();

		expect(MOCK_LIST_QUEUABLE).toHaveBeenCalled();
		expect(MOCK_PUSH).toHaveBeenCalledTimes(2);
		expect(MOCK_PUSH).toHaveBeenCalledWith("id1");
		expect(MOCK_PUSH).toHaveBeenCalledWith("id2");
	});

	it("should handle errors gracefully", async () => {
		MOCK_LIST_QUEUABLE.mockRejectedValue(new Error("DB error"));

		const { rebuildQueueFromMongo } = jest.requireActual(
			"../../src/dlq/auto-retry-queue"
		) as { rebuildQueueFromMongo: () => Promise<void> };
		await expect(rebuildQueueFromMongo()).resolves.toBeUndefined();
	});

	it("should handle empty list", async () => {
		MOCK_LIST_QUEUABLE.mockResolvedValue([]);

		const { rebuildQueueFromMongo } = jest.requireActual(
			"../../src/dlq/auto-retry-queue"
		) as { rebuildQueueFromMongo: () => Promise<void> };
		await rebuildQueueFromMongo();

		expect(MOCK_PUSH).not.toHaveBeenCalled();
	});
});
