import { describe, expect, it, jest } from "@jest/globals";

const MOCK_LIST_QUEUABLE = jest.fn();
const MOCK_PUSH = jest.fn();

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createQueueRebuilder } from "../../src/application/services/auto-retry-queue";

const rebuildQueueFromMongo = createQueueRebuilder({
	entries: { listQueuable: MOCK_LIST_QUEUABLE as never },
	queue: { push: MOCK_PUSH as never, isAvailable: () => true },
});

describe("auto-retry-queue", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should push queuable entries to Redis", async () => {
		MOCK_LIST_QUEUABLE.mockResolvedValue(["id1", "id2"]);

		await rebuildQueueFromMongo();

		expect(MOCK_LIST_QUEUABLE).toHaveBeenCalled();
		expect(MOCK_PUSH).toHaveBeenCalledTimes(2);
		expect(MOCK_PUSH).toHaveBeenCalledWith("id1");
		expect(MOCK_PUSH).toHaveBeenCalledWith("id2");
	});

	it("should handle errors gracefully", async () => {
		MOCK_LIST_QUEUABLE.mockRejectedValue(new Error("DB error"));

		await expect(rebuildQueueFromMongo()).resolves.toBeUndefined();
	});

	it("should handle empty list", async () => {
		MOCK_LIST_QUEUABLE.mockResolvedValue([]);

		await rebuildQueueFromMongo();

		expect(MOCK_PUSH).not.toHaveBeenCalled();
	});
});
