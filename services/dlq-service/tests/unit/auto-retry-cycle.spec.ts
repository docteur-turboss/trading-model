import { describe, expect, it, jest } from "@jest/globals";

const MOCK_CLAIM_ENTRIES_FOR_RETRY = jest.fn();
const MOCK_RELEASE_STALE = jest.fn();
const MOCK_ABANDON_EXHAUSTED = jest.fn();
const MOCK_DO_REPLAY_BATCH = jest.fn();
const MOCK_NOTIFY_AUDIT = jest.fn();
const MOCK_IS_SHUTTING_DOWN = jest.fn();

jest.mock("../../src/config/env", () => ({
	ENV: {
		DLQ_AUTO_RETRY_ENABLED: true,
		DLQ_AUTO_RETRY_LIMIT: 50,
		INSTANCE_ID: "test-instance",
		MESSAGE_MANAGER_URL: "",
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/config/audit", () => ({
	notifyAudit: MOCK_NOTIFY_AUDIT,
}));

jest.mock("../../src/config/metrics", () => ({
	metrics: {
		entriesReplayed: { inc: jest.fn() },
		entriesReplayFailed: { inc: jest.fn() },
	},
}));

jest.mock("../../src/dlq/claim-manager", () => ({
	dlqClaimManager: {
		claimEntriesForRetry: MOCK_CLAIM_ENTRIES_FOR_RETRY,
	},
}));

jest.mock("../../src/dlq/claim-manager", () => ({
	dlqClaimManager: {
		claimEntriesForRetry: MOCK_CLAIM_ENTRIES_FOR_RETRY,
	},
	claimReleaseManager: {
		releaseStaleClaims: MOCK_RELEASE_STALE,
	},
}));

jest.mock("../../src/dlq/retry-manager", () => ({
	dlqRetryManager: {
		abandonExhaustedEntries: MOCK_ABANDON_EXHAUSTED,
	},
}));

jest.mock("../../src/dlq/replay-pipeline", () => ({
	doReplayBatch: MOCK_DO_REPLAY_BATCH,
}));

jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest.fn(),
}));

jest.mock("../../src/dlq/shared/shutdown-flag", () => ({
	isShuttingDown: MOCK_IS_SHUTTING_DOWN,
}));

describe("auto-retry-cycle", () => {
	function getAddressManagerMock() {
		return jest.requireMock("../../src/config/address-manager") as {
			FIND_A_SERVICE: jest.Mock;
		};
	}

	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		getAddressManagerMock().FIND_A_SERVICE.mockResolvedValue({
			host: "10.0.0.5",
			port: 3000,
		});
	});

	it("should autoRetryTick and skip when disabled", async () => {
		const envMock = jest.requireMock("../../src/config/env") as {
			ENV: { DLQ_AUTO_RETRY_ENABLED: boolean };
		};
		envMock.ENV.DLQ_AUTO_RETRY_ENABLED = false;

		const { autoRetryTick } = jest.requireActual(
			"../../src/dlq/auto-retry-cycle"
		) as { autoRetryTick: () => Promise<void> };

		await autoRetryTick();

		expect(MOCK_DO_REPLAY_BATCH).not.toHaveBeenCalled();
	});

	it("should skip when shutting down", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(true);

		const { autoRetryTick } = jest.requireActual(
			"../../src/dlq/auto-retry-cycle"
		) as { autoRetryTick: () => Promise<void> };

		await autoRetryTick();

		expect(MOCK_DO_REPLAY_BATCH).not.toHaveBeenCalled();
	});

	it("should skip when MM URL is not available", async () => {
		getAddressManagerMock().FIND_A_SERVICE.mockResolvedValue(null);

		const { autoRetryTick } = jest.requireActual(
			"../../src/dlq/auto-retry-cycle"
		) as { autoRetryTick: () => Promise<void> };

		await autoRetryTick();

		expect(MOCK_DO_REPLAY_BATCH).not.toHaveBeenCalled();
	});

	it("should handle full retry cycle with entries", async () => {
		MOCK_RELEASE_STALE.mockResolvedValue(undefined);
		MOCK_CLAIM_ENTRIES_FOR_RETRY.mockResolvedValue([
			{ id: "507f1f77bcf86cd799439011", message: { text: "test" } },
		]);
		MOCK_DO_REPLAY_BATCH.mockResolvedValue({
			success: 1,
			errors: [],
		});
		MOCK_ABANDON_EXHAUSTED.mockResolvedValue(5);

		const { autoRetryTick } = jest.requireActual(
			"../../src/dlq/auto-retry-cycle"
		) as { autoRetryTick: () => Promise<void> };

		await autoRetryTick();

		expect(MOCK_RELEASE_STALE).toHaveBeenCalled();
		expect(MOCK_CLAIM_ENTRIES_FOR_RETRY).toHaveBeenCalled();
		expect(MOCK_DO_REPLAY_BATCH).toHaveBeenCalled();
		expect(MOCK_NOTIFY_AUDIT).toHaveBeenCalled();
	});

	it("should handle retry cycle with errors", async () => {
		MOCK_RELEASE_STALE.mockResolvedValue(undefined);
		MOCK_CLAIM_ENTRIES_FOR_RETRY.mockResolvedValue([
			{ id: "507f1f77bcf86cd799439011", message: { text: "test" } },
		]);
		MOCK_DO_REPLAY_BATCH.mockResolvedValue({
			success: 0,
			errors: [{ id: "1", error: "timeout" }],
		});

		const { autoRetryTick } = jest.requireActual(
			"../../src/dlq/auto-retry-cycle"
		) as { autoRetryTick: () => Promise<void> };

		await autoRetryTick();

		expect(MOCK_DO_REPLAY_BATCH).toHaveBeenCalled();
		expect(MOCK_ABANDON_EXHAUSTED).toHaveBeenCalled();
		expect(MOCK_NOTIFY_AUDIT).toHaveBeenCalled();
	});

	it("should handle empty entries and call abandon", async () => {
		MOCK_RELEASE_STALE.mockResolvedValue(undefined);
		MOCK_CLAIM_ENTRIES_FOR_RETRY.mockResolvedValue([]);

		const { autoRetryTick } = jest.requireActual(
			"../../src/dlq/auto-retry-cycle"
		) as { autoRetryTick: () => Promise<void> };

		await autoRetryTick();

		expect(MOCK_ABANDON_EXHAUSTED).toHaveBeenCalled();
		expect(MOCK_DO_REPLAY_BATCH).not.toHaveBeenCalled();
	});
});
