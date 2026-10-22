import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_IS_SHUTTING_DOWN = jest.fn<() => boolean>();

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/config/metrics", () => ({
	metrics: {
		entriesReplayed: { inc: jest.fn() },
		entriesReplayFailed: { inc: jest.fn() },
	},
}));

jest.mock("../../src/shared/shutdown-flag", () => ({
	isShuttingDown: MOCK_IS_SHUTTING_DOWN,
}));

import { Limit, toInstanceId } from "@trading-model/primitives/primitives";
import {
	type AutoRetryCycleDeps,
	createAutoRetryCycle,
} from "../../src/application/services/auto-retry-cycle";

function makeDeps(overrides?: { autoRetryEnabled?: boolean }) {
	const deps = {
		claims: {
			claimEntriesForRetry: jest.fn<any>(),
			claimEntriesByIds: jest.fn<any>(),
		},
		claimRelease: {
			releaseStaleClaims: jest.fn<any>().mockResolvedValue(0),
			releaseClaimsByInstance: jest.fn<any>(),
			releaseAllActiveClaims: jest.fn<any>(),
		},
		retryLedger: {
			abandonExhaustedEntries: jest.fn<any>().mockResolvedValue(0),
		},
		messageManager: {
			resolve: jest.fn<any>().mockResolvedValue("https://10.0.0.5:3000"),
		},
		audit: { notifyReplay: jest.fn() },
		replayBatch: jest.fn<any>(),
		settings: {
			instanceId: toInstanceId("test-instance"),
			autoRetryEnabled: overrides?.autoRetryEnabled ?? true,
			autoRetryLimit: Limit.of(50, 100),
		},
	};
	return deps;
}

describe("auto-retry-cycle", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
	});

	it("should skip the tick when auto-retry is disabled", async () => {
		const deps = makeDeps({ autoRetryEnabled: false });
		await createAutoRetryCycle(deps as unknown as AutoRetryCycleDeps).tick();

		expect(deps.messageManager.resolve).not.toHaveBeenCalled();
		expect(deps.replayBatch).not.toHaveBeenCalled();
	});

	it("should skip when shutting down", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(true);
		const deps = makeDeps();
		await createAutoRetryCycle(deps as unknown as AutoRetryCycleDeps).tick();

		expect(deps.replayBatch).not.toHaveBeenCalled();
	});

	it("should skip when the message-manager URL is not available", async () => {
		const deps = makeDeps();
		deps.messageManager.resolve.mockResolvedValue(null);
		await createAutoRetryCycle(deps as unknown as AutoRetryCycleDeps).tick();

		expect(deps.claimRelease.releaseStaleClaims).not.toHaveBeenCalled();
		expect(deps.replayBatch).not.toHaveBeenCalled();
	});

	it("should run a full retry cycle with entries", async () => {
		const deps = makeDeps();
		deps.claims.claimEntriesForRetry.mockResolvedValue([
			{ id: "507f1f77bcf86cd799439011", message: { text: "test" } },
		]);
		deps.replayBatch.mockResolvedValue({ success: 1, errors: [] });

		await createAutoRetryCycle(deps as unknown as AutoRetryCycleDeps).tick();

		expect(deps.claimRelease.releaseStaleClaims).toHaveBeenCalled();
		expect(deps.claims.claimEntriesForRetry).toHaveBeenCalledWith(
			expect.objectContaining({ limit: 50, instanceId: "test-instance" })
		);
		expect(deps.replayBatch).toHaveBeenCalledWith(
			expect.objectContaining({
				messageManagerUrl: "https://10.0.0.5:3000",
				instanceId: "test-instance",
				entries: [
					{ id: "507f1f77bcf86cd799439011", message: { text: "test" } },
				],
			})
		);
		expect(deps.audit.notifyReplay).toHaveBeenCalledWith(
			expect.objectContaining({ topic: "dlq-service", success: 1, failed: 0 })
		);
		expect(deps.retryLedger.abandonExhaustedEntries).not.toHaveBeenCalled();
	});

	it("should abandon exhausted entries when the replay has errors", async () => {
		const deps = makeDeps();
		deps.claims.claimEntriesForRetry.mockResolvedValue([
			{ id: "507f1f77bcf86cd799439011", message: { text: "test" } },
		]);
		deps.replayBatch.mockResolvedValue({
			success: 0,
			errors: [{ id: "1", error: "timeout" }],
		});
		deps.retryLedger.abandonExhaustedEntries.mockResolvedValue(5);

		await createAutoRetryCycle(deps as unknown as AutoRetryCycleDeps).tick();

		expect(deps.retryLedger.abandonExhaustedEntries).toHaveBeenCalled();
		expect(deps.audit.notifyReplay).toHaveBeenCalledWith(
			expect.objectContaining({ success: 0, failed: 1 })
		);
	});

	it("should abandon exhausted entries when nothing is claimable", async () => {
		const deps = makeDeps();
		deps.claims.claimEntriesForRetry.mockResolvedValue([]);

		await createAutoRetryCycle(deps as unknown as AutoRetryCycleDeps).tick();

		expect(deps.retryLedger.abandonExhaustedEntries).toHaveBeenCalled();
		expect(deps.replayBatch).not.toHaveBeenCalled();
	});

	it("should expose handleAbandonedEntries for other replay paths", async () => {
		const deps = makeDeps();
		deps.retryLedger.abandonExhaustedEntries.mockResolvedValue(2);

		await createAutoRetryCycle(
			deps as unknown as AutoRetryCycleDeps
		).handleAbandonedEntries("DLQ Redis queue");

		expect(deps.retryLedger.abandonExhaustedEntries).toHaveBeenCalledTimes(1);
	});
});
