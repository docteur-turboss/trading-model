import { describe, expect, it, jest } from "@jest/globals";

const MOCK_POP = jest.fn();
const MOCK_IS_AVAILABLE = jest.fn();
const MOCK_CLAIM_ENTRIES_BY_IDS = jest.fn();
const MOCK_RELEASE_STALE = jest.fn();
const MOCK_DO_REPLAY_BATCH = jest.fn();
const MOCK_IS_SHUTTING_DOWN = jest.fn();
const MOCK_RESOLVE_MM_URL = jest.fn();
const MOCK_HANDLE_ABANDONED = jest.fn();

jest.mock("../../src/config/env", () => ({
	ENV: {
		DLQ_AUTO_RETRY_LIMIT: 50,
		INSTANCE_ID: "test-instance",
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/config/metrics", () => ({
	metrics: {
		entriesReplayed: { inc: jest.fn() },
		entriesReplayFailed: { inc: jest.fn() },
	},
}));

jest.mock("../../src/config/redis-queue", () => ({
	dlqRedisQueue: {
		pop: MOCK_POP,
		isAvailable: MOCK_IS_AVAILABLE,
		push: jest.fn(),
	},
}));

jest.mock("../../src/dlq/claim-manager", () => ({
	dlqClaimManager: {
		claimEntriesByIds: MOCK_CLAIM_ENTRIES_BY_IDS,
		releaseStaleClaims: MOCK_RELEASE_STALE,
	},
}));

jest.mock("../../src/dlq/replay-pipeline", () => ({
	doReplayBatch: MOCK_DO_REPLAY_BATCH,
}));

jest.mock("../../src/dlq/shared/shutdown-flag", () => ({
	isShuttingDown: MOCK_IS_SHUTTING_DOWN,
}));

jest.mock("../../src/dlq/address-resolver", () => ({
	resolveMessageManagerUrl: MOCK_RESOLVE_MM_URL,
}));

jest.mock("../../src/dlq/auto-retry", () => ({
	handleAbandonedEntries: MOCK_HANDLE_ABANDONED,
}));

describe("redis-queue-processor", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_IS_AVAILABLE.mockReturnValue(true);
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		MOCK_RESOLVE_MM_URL.mockResolvedValue("https://mm:3000");
	});

	it("should start and stop redis worker loop", () => {
		const { startRedisWorkerLoop, stopRedisWorkerTimer } = jest.requireActual(
			"../../src/dlq/redis-queue-processor"
		) as {
			startRedisWorkerLoop: () => void;
			stopRedisWorkerTimer: () => void;
		};

		startRedisWorkerLoop();
		stopRedisWorkerTimer();
	});

	it("should skip processing when shutting down", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(true);

		const { processRedisQueue } = jest.requireActual(
			"../../src/dlq/redis-queue-processor"
		) as { processRedisQueue: () => Promise<void> };

		await processRedisQueue();

		expect(MOCK_RESOLVE_MM_URL).not.toHaveBeenCalled();
	});

	it("should skip processing when redis queue not available", async () => {
		MOCK_IS_AVAILABLE.mockReturnValue(false);

		const { processRedisQueue } = jest.requireActual(
			"../../src/dlq/redis-queue-processor"
		) as { processRedisQueue: () => Promise<void> };

		await processRedisQueue();

		expect(MOCK_RESOLVE_MM_URL).not.toHaveBeenCalled();
	});

	it("should skip processing when MM URL not available", async () => {
		MOCK_RESOLVE_MM_URL.mockResolvedValue(null);

		const { processRedisQueue } = jest.requireActual(
			"../../src/dlq/redis-queue-processor"
		) as { processRedisQueue: () => Promise<void> };

		await processRedisQueue();

		expect(MOCK_RELEASE_STALE).not.toHaveBeenCalled();
	});

	it("should skip processing when no entries in queue", async () => {
		MOCK_POP.mockResolvedValue(null);

		const { processRedisQueue } = jest.requireActual(
			"../../src/dlq/redis-queue-processor"
		) as { processRedisQueue: () => Promise<void> };

		await processRedisQueue();

		expect(MOCK_RELEASE_STALE).toHaveBeenCalled();
		expect(MOCK_CLAIM_ENTRIES_BY_IDS).not.toHaveBeenCalled();
	});

	it("should process queue entries successfully", async () => {
		MOCK_POP.mockResolvedValueOnce(
			"507f1f77bcf86cd799439011"
		).mockResolvedValueOnce(null);
		MOCK_CLAIM_ENTRIES_BY_IDS.mockResolvedValue([
			{ id: "507f1f77bcf86cd799439011", message: { text: "hi" } },
		]);
		MOCK_DO_REPLAY_BATCH.mockResolvedValue({ success: 1, errors: [] });

		const { processRedisQueue } = jest.requireActual(
			"../../src/dlq/redis-queue-processor"
		) as { processRedisQueue: () => Promise<void> };

		await processRedisQueue();

		expect(MOCK_RELEASE_STALE).toHaveBeenCalled();
		expect(MOCK_CLAIM_ENTRIES_BY_IDS).toHaveBeenCalled();
		expect(MOCK_DO_REPLAY_BATCH).toHaveBeenCalled();
	});

	it("should handle queue entries with errors", async () => {
		MOCK_POP.mockResolvedValueOnce(
			"507f1f77bcf86cd799439011"
		).mockResolvedValueOnce(null);
		MOCK_CLAIM_ENTRIES_BY_IDS.mockResolvedValue([
			{ id: "507f1f77bcf86cd799439011", message: { text: "hi" } },
		]);
		MOCK_DO_REPLAY_BATCH.mockResolvedValue({
			success: 0,
			errors: [{ id: "1", error: "timeout" }],
		});

		const { processRedisQueue } = jest.requireActual(
			"../../src/dlq/redis-queue-processor"
		) as { processRedisQueue: () => Promise<void> };

		await processRedisQueue();

		expect(MOCK_HANDLE_ABANDONED).toHaveBeenCalled();
	});
});
