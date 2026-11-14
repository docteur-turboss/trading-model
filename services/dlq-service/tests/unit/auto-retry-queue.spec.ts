import { describe, expect, it, jest } from "@jest/globals";

const MOCK_LIST_QUEUABLE = jest.fn<(...args: any[]) => any>();
const MOCK_PUSH = jest.fn<(...args: any[]) => any>();

jest.mock("@trading-model/contracts/logger-registry", () => {
	const logger = {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	};
	return { getLogger: () => logger, logger };
});

const { logger: MOCK_LOGGER } = jest.requireMock(
	"@trading-model/contracts/logger-registry"
) as {
	logger: {
		info: jest.Mock<(...args: any[]) => any>;
		warn: jest.Mock<(...args: any[]) => any>;
	};
};

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

	it("should report only the entries actually pushed", async () => {
		MOCK_LIST_QUEUABLE.mockResolvedValue(["id1", "id2", "id3"]);
		MOCK_PUSH.mockResolvedValueOnce(true)
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true);

		await rebuildQueueFromMongo();

		expect(MOCK_LOGGER.info).not.toHaveBeenCalled();
		expect(MOCK_LOGGER.warn).toHaveBeenCalledWith(
			"Redis queue partially rebuilt from MongoDB",
			{ pushedCount: 2, queuableCount: 3 }
		);
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
