import { describe, expect, it, jest } from "@jest/globals";

const MOCK_PRUNE = jest.fn();

jest.mock("../../src/config/env", () => ({
	ENV: {
		MAX_ENTRIES: 100,
		DLQ_PRUNE_INTERVAL_MS: 60000,
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/config/metrics", () => ({
	metrics: {
		entriesPruned: { inc: jest.fn() },
		pruneErrors: { inc: jest.fn() },
	},
}));

jest.mock("../../src/dlq/repository", () => ({
	dlqRepository: {
		prune: MOCK_PRUNE,
	},
}));

describe("DlqPruner", () => {
	let DlqPrunerClass: new () => {
		start: () => void;
		stop: () => void;
		prune: () => Promise<number>;
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/dlq/dlq-pruner") as {
			DlqPruner: typeof DlqPrunerClass;
		};
		DlqPrunerClass = mod.DlqPruner;
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should prune and log when pruned > 0", async () => {
		MOCK_PRUNE.mockResolvedValue(5);
		const logger = jest.requireMock("../../src/config/logger") as {
			logger: { info: jest.Mock };
		};
		const metrics = jest.requireMock("../../src/config/metrics") as {
			metrics: { entriesPruned: { inc: jest.Mock } };
		};

		const pruner = new DlqPrunerClass();
		const result = await pruner.prune();

		expect(result).toBe(5);
		expect(metrics.metrics.entriesPruned.inc).toHaveBeenCalledWith(5);
		expect(logger.logger.info).toHaveBeenCalledWith("Pruned 5 old DLQ entries");
	});

	it("should prune and not log when pruned is 0", async () => {
		MOCK_PRUNE.mockResolvedValue(0);
		const logger = jest.requireMock("../../src/config/logger") as {
			logger: { info: jest.Mock };
		};

		const pruner = new DlqPrunerClass();
		const result = await pruner.prune();

		expect(result).toBe(0);
		expect(logger.logger.info).not.toHaveBeenCalled();
	});

	it("should handle prune errors", async () => {
		MOCK_PRUNE.mockRejectedValue(new Error("prune error"));
		const logger = jest.requireMock("../../src/config/logger") as {
			logger: { error: jest.Mock };
		};

		const pruner = new DlqPrunerClass();
		const result = await pruner.prune();

		expect(result).toBe(0);
		expect(logger.logger.error).toHaveBeenCalledWith(
			"DLQ periodic prune failed",
			expect.any(Object)
		);
	});

	it("should start the timer", () => {
		const pruner = new DlqPrunerClass();
		pruner.start();
	});

	it("should not start the timer twice", () => {
		const pruner = new DlqPrunerClass();
		pruner.start();
		pruner.start();
	});

	it("should stop the timer", () => {
		const pruner = new DlqPrunerClass();
		pruner.stop();
	});
});
