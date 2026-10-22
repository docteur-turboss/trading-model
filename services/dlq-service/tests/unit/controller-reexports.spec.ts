import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/shared/auto-retry", () => ({
	autoRetryTick: jest.fn(),
	processRedisQueue: jest.fn(),
	rebuildQueueFromMongo: jest.fn(),
}));

jest.mock("../../src/infrastructure/auto-retry-scheduler", () => ({
	startAutoRetry: jest.fn(),
	stopAutoRetry: jest.fn(),
}));

jest.mock("../../src/adapters/outbound/http-client-manager", () => ({
	reloadHttpClientTls: jest.fn(),
}));

jest.mock("../../src/shared/shutdown-flag", () => ({
	setShuttingDown: jest.fn(),
}));

jest.mock("../../src/config/redis-queue", () => ({
	dlqRedisQueue: { close: jest.fn() },
}));

jest.mock("../../src/infrastructure/dlq-pruner", () => ({
	DlqPruner: jest.fn(() => ({
		prune: jest.fn(),
		start: jest.fn(),
		stop: jest.fn(),
	})),
}));

jest.mock("../../src/config/container", () => ({
	claimReleaseService: {
		releaseStale: jest.fn(),
		releaseAndRequeue: jest.fn(),
	},
	replayDrainService: { drain: jest.fn() },
}));

describe("controller-reexports", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should re-export all expected functions", () => {
		const reexports = jest.requireActual(
			"../../src/shared/controller-reexports"
		) as Record<string, unknown>;

		expect(typeof reexports.autoRetryTick).toBe("function");
		expect(typeof reexports.processRedisQueue).toBe("function");
		expect(typeof reexports.rebuildQueueFromMongo).toBe("function");
		expect(typeof reexports.startAutoRetry).toBe("function");
		expect(typeof reexports.stopAutoRetry).toBe("function");
		expect(typeof reexports.reloadHttpClientTls).toBe("function");
		expect(typeof reexports.pruneOldEntries).toBe("function");
		expect(typeof reexports.releaseStaleClaims).toBe("function");
		expect(typeof reexports.shutdownSchedulers).toBe("function");
		expect(typeof reexports.startPeriodicPrune).toBe("function");
		expect(typeof reexports.stopPeriodicPrune).toBe("function");
	});

	it("should call reloadHttpClientTls", async () => {
		const { reloadHttpClientTls } = jest.requireActual(
			"../../src/shared/controller-reexports"
		) as { reloadHttpClientTls: () => Promise<void> };
		await reloadHttpClientTls();
	});

	it("should call start and stop periodic prune", () => {
		const { startPeriodicPrune, stopPeriodicPrune } = jest.requireActual(
			"../../src/shared/controller-reexports"
		) as { startPeriodicPrune: () => void; stopPeriodicPrune: () => void };
		startPeriodicPrune();
		stopPeriodicPrune();
	});
});
