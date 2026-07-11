import { describe, expect, it, jest } from "@jest/globals";

const MOCK_SET_SHUTTING_DOWN = jest.fn();
const MOCK_CLOSE_REDIS_QUEUE = jest.fn();
const MOCK_CLOSE_HTTP_CLIENT = jest.fn();
const MOCK_STOP_AUTO_RETRY = jest.fn();
const MOCK_PRUNE = jest.fn();
const MOCK_PRUNE_START = jest.fn();
const MOCK_PRUNE_STOP = jest.fn();
const MOCK_DRAIN = jest.fn();
const MOCK_RELEASE_AND_REQUEUE = jest.fn();
const MOCK_RELEASE_STALE = jest.fn();

jest.mock("../../src/config/redis-queue", () => ({
	dlqRedisQueue: { close: MOCK_CLOSE_REDIS_QUEUE },
}));

jest.mock("../../src/dlq/auto-retry-scheduler", () => ({
	stopAutoRetry: MOCK_STOP_AUTO_RETRY,
}));

jest.mock("../../src/dlq/claim-release-service", () => ({
	ClaimReleaseService: jest.fn(() => ({
		releaseStale: MOCK_RELEASE_STALE,
		releaseAndRequeue: MOCK_RELEASE_AND_REQUEUE,
	})),
}));

jest.mock("../../src/dlq/dlq-pruner", () => ({
	DlqPruner: jest.fn(() => ({
		prune: MOCK_PRUNE,
		start: MOCK_PRUNE_START,
		stop: MOCK_PRUNE_STOP,
	})),
}));

jest.mock("../../src/dlq/replay-drain-service", () => ({
	ReplayDrainService: jest.fn(() => ({
		drain: MOCK_DRAIN,
	})),
}));

jest.mock("../../src/dlq/shared/http-client-manager", () => ({
	closeHttpClient: MOCK_CLOSE_HTTP_CLIENT,
}));

jest.mock("../../src/dlq/shared/shutdown-flag", () => ({
	setShuttingDown: MOCK_SET_SHUTTING_DOWN,
}));

describe("shutdown-manager", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should prune old entries", async () => {
		MOCK_PRUNE.mockResolvedValue(5);
		const { pruneOldEntries } = jest.requireActual(
			"../../src/dlq/shutdown-manager"
		) as { pruneOldEntries: () => Promise<number> };
		const result = await pruneOldEntries();
		expect(result).toBe(5);
	});

	it("should release stale claims", async () => {
		MOCK_RELEASE_STALE.mockResolvedValue(undefined);
		const { releaseStaleClaims } = jest.requireActual(
			"../../src/dlq/shutdown-manager"
		) as { releaseStaleClaims: (ms?: number) => Promise<void> };
		await releaseStaleClaims(60000);
		expect(MOCK_RELEASE_STALE).toHaveBeenCalledWith(60000);
	});

	it("should shutdown schedulers in order", async () => {
		MOCK_CLOSE_REDIS_QUEUE.mockResolvedValue(undefined);
		MOCK_CLOSE_HTTP_CLIENT.mockResolvedValue(undefined);
		MOCK_DRAIN.mockResolvedValue(undefined);
		MOCK_RELEASE_AND_REQUEUE.mockResolvedValue(undefined);

		const { shutdownSchedulers } = jest.requireActual(
			"../../src/dlq/shutdown-manager"
		) as { shutdownSchedulers: () => Promise<void> };
		await shutdownSchedulers();

		expect(MOCK_SET_SHUTTING_DOWN).toHaveBeenCalledWith(true);
		expect(MOCK_PRUNE_STOP).toHaveBeenCalled();
		expect(MOCK_STOP_AUTO_RETRY).toHaveBeenCalled();
		expect(MOCK_DRAIN).toHaveBeenCalled();
		expect(MOCK_RELEASE_AND_REQUEUE).toHaveBeenCalled();
		expect(MOCK_CLOSE_REDIS_QUEUE).toHaveBeenCalled();
		expect(MOCK_CLOSE_HTTP_CLIENT).toHaveBeenCalled();
	});

	it("should start and stop periodic prune", async () => {
		const { startPeriodicPrune, stopPeriodicPrune } = jest.requireActual(
			"../../src/dlq/shutdown-manager"
		) as {
			startPeriodicPrune: () => void;
			stopPeriodicPrune: () => void;
		};
		startPeriodicPrune();
		expect(MOCK_PRUNE_START).toHaveBeenCalled();

		stopPeriodicPrune();
		expect(MOCK_PRUNE_STOP).toHaveBeenCalled();
	});

	it("should alias shutdown to shutdownSchedulers", async () => {
		MOCK_CLOSE_REDIS_QUEUE.mockResolvedValue(undefined);
		MOCK_CLOSE_HTTP_CLIENT.mockResolvedValue(undefined);
		MOCK_DRAIN.mockResolvedValue(undefined);
		MOCK_RELEASE_AND_REQUEUE.mockResolvedValue(undefined);

		const { shutdown } = jest.requireActual(
			"../../src/dlq/shutdown-manager"
		) as { shutdown: () => Promise<void> };
		await shutdown();

		expect(MOCK_SET_SHUTTING_DOWN).toHaveBeenCalledWith(true);
	});
});
