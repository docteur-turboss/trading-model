import { describe, expect, it, jest } from "@jest/globals";

const MOCK_PRUNE = jest.fn<(...args: any[]) => any>();
const MOCK_COUNT = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		MAX_ENTRIES: 100,
		DLQ_PRUNE_INTERVAL_MS: 60000,
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("../../src/config/metrics", () => ({
	metrics: {
		entriesPruned: { inc: jest.fn<(...args: any[]) => any>() },
		pruneErrors: { inc: jest.fn<(...args: any[]) => any>() },
		collectionSize: { set: jest.fn<(...args: any[]) => any>() },
	},
}));

describe("DlqPruner", () => {
	let DlqPrunerClass: new (
		entries: unknown,
		env: unknown
	) => {
		start: () => void;
		stop: () => void;
		prune: () => Promise<number>;
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/infrastructure/dlq-pruner") as {
			DlqPruner: typeof DlqPrunerClass;
		};
		DlqPrunerClass = mod.DlqPruner;
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should prune and log when pruned > 0", async () => {
		MOCK_PRUNE.mockResolvedValue(5);
		MOCK_COUNT.mockResolvedValue(42);
		const logger = jest.requireMock("../../src/config/logger") as {
			logger: { info: jest.Mock<(...args: any[]) => any> };
		};
		const metrics = jest.requireMock("../../src/config/metrics") as {
			metrics: {
				entriesPruned: { inc: jest.Mock<(...args: any[]) => any> };
				collectionSize: { set: jest.Mock<(...args: any[]) => any> };
			};
		};

		const pruner = new DlqPrunerClass(
			{ prune: MOCK_PRUNE, count: MOCK_COUNT },
			{ MAX_ENTRIES: 100, DLQ_PRUNE_INTERVAL_MS: 60000 }
		);
		const result = await pruner.prune();

		expect(result).toBe(5);
		expect(metrics.metrics.entriesPruned.inc).toHaveBeenCalledWith(5);
		expect(metrics.metrics.collectionSize.set).toHaveBeenCalledWith(42);
		expect(logger.logger.info).toHaveBeenCalledWith("Pruned 5 old DLQ entries");
	});

	it("should prune and not log when pruned is 0", async () => {
		MOCK_PRUNE.mockResolvedValue(0);
		const logger = jest.requireMock("../../src/config/logger") as {
			logger: { info: jest.Mock<(...args: any[]) => any> };
		};

		const pruner = new DlqPrunerClass(
			{ prune: MOCK_PRUNE, count: MOCK_COUNT },
			{ MAX_ENTRIES: 100, DLQ_PRUNE_INTERVAL_MS: 60000 }
		);
		const result = await pruner.prune();

		expect(result).toBe(0);
		expect(logger.logger.info).not.toHaveBeenCalled();
	});

	it("should handle prune errors", async () => {
		MOCK_PRUNE.mockRejectedValue(new Error("prune error"));
		const logger = jest.requireMock("../../src/config/logger") as {
			logger: { error: jest.Mock<(...args: any[]) => any> };
		};

		const pruner = new DlqPrunerClass(
			{ prune: MOCK_PRUNE, count: MOCK_COUNT },
			{ MAX_ENTRIES: 100, DLQ_PRUNE_INTERVAL_MS: 60000 }
		);
		const result = await pruner.prune();

		expect(result).toBe(0);
		expect(logger.logger.error).toHaveBeenCalledWith(
			"DLQ periodic prune failed",
			expect.any(Object)
		);
	});

	it("should start the timer", () => {
		const pruner = new DlqPrunerClass(
			{ prune: MOCK_PRUNE, count: MOCK_COUNT },
			{ MAX_ENTRIES: 100, DLQ_PRUNE_INTERVAL_MS: 60000 }
		);
		pruner.start();
	});

	it("should not start the timer twice", () => {
		const pruner = new DlqPrunerClass(
			{ prune: MOCK_PRUNE, count: MOCK_COUNT },
			{ MAX_ENTRIES: 100, DLQ_PRUNE_INTERVAL_MS: 60000 }
		);
		pruner.start();
		pruner.start();
	});

	it("should stop the timer", () => {
		const pruner = new DlqPrunerClass(
			{ prune: MOCK_PRUNE, count: MOCK_COUNT },
			{ MAX_ENTRIES: 100, DLQ_PRUNE_INTERVAL_MS: 60000 }
		);
		pruner.stop();
	});
});
