import { describe, expect, it, jest } from "@jest/globals";
import type { Span } from "@opentelemetry/api";
import {
	type InstanceId,
	toInstanceId,
	toMessageId,
	type URLString,
} from "@trading-model/primitives/primitives";
import {
	createReplayEntries,
	type ReplayEntriesDeps,
} from "../../src/application/use-cases/dlq-replay-service";
import type {
	ClaimEntriesOptions,
	ClaimedEntry,
} from "../../src/domain/ports/replay.ports";
import type { BatchResults, ReplayBatchOptions } from "../../src/shared/types";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: { warn: jest.fn<(...args: any[]) => any>() },
}));

const MM_URL = "https://mm:3000" as URLString;
const INSTANCE = toInstanceId("dlq-1") as InstanceId;
const CLAIMED: ClaimedEntry[] = [
	{ id: "e1", message: { a: 1 }, service: "audit-logger" },
];

const span = {
	setAttribute: jest.fn(),
	setStatus: jest.fn(),
	end: jest.fn(),
} as never as Span;

function setup(
	overrides: {
		url?: URLString | null;
		claimed?: ClaimedEntry[];
		batch?: BatchResults;
	} = {}
) {
	const resolve = jest.fn<() => Promise<URLString | null>>(async () =>
		overrides.url === undefined ? MM_URL : overrides.url
	);
	const claimEntriesForRetry = jest.fn<
		(options: ClaimEntriesOptions) => Promise<ClaimedEntry[]>
	>(async () => overrides.claimed ?? CLAIMED);
	const abandonExhaustedEntries = jest.fn<() => Promise<number>>(async () => 0);
	const replayBatch = jest.fn<
		(options: ReplayBatchOptions) => Promise<BatchResults>
	>(async () => overrides.batch ?? { success: 1, errors: [] });
	const notifyReplay = jest.fn<(...args: any[]) => void>();
	const batchReplayed = jest.fn<(success: number, failed: number) => void>();
	const deps: ReplayEntriesDeps = {
		messageManager: { resolve },
		claimRelease: { releaseStaleClaims: async () => 0 },
		claims: { claimEntriesForRetry },
		retryLedger: { abandonExhaustedEntries },
		replayBatch,
		audit: { notifyReplay },
		metrics: { batchReplayed },
		settings: { instanceId: INSTANCE },
	};
	return {
		replay: createReplayEntries(deps),
		claimEntriesForRetry,
		abandonExhaustedEntries,
		replayBatch,
		notifyReplay,
		batchReplayed,
	};
}

describe("replay use case", () => {
	it("claims, replays, counts and audits a batch", async () => {
		const t = setup();

		const result = await t.replay({ limit: 10, batchId: "b1" }, span);

		expect(result).toEqual({
			status: "replayed",
			details: { batchId: "b1", replayed: 1, failed: 0 },
		});
		expect(t.claimEntriesForRetry).toHaveBeenCalledWith(
			expect.objectContaining({
				batchId: "b1",
				instanceId: INSTANCE,
				limit: 10,
			})
		);
		expect(t.replayBatch).toHaveBeenCalledWith({
			entries: [
				{ id: toMessageId("e1"), message: { a: 1 }, service: "audit-logger" },
			],
			messageManagerUrl: MM_URL,
			batchId: "b1",
			instanceId: INSTANCE,
		});
		expect(t.batchReplayed).toHaveBeenCalledWith(1, 0);
		expect(t.notifyReplay).toHaveBeenCalledWith(
			expect.objectContaining({ batchId: "b1", success: 1, failed: 0 })
		);
		expect(t.abandonExhaustedEntries).not.toHaveBeenCalled();
	});

	it("abandons the exhausted entries when some replay failed", async () => {
		const t = setup({
			batch: {
				success: 0,
				errors: [{ id: toMessageId("e1"), error: "timeout" }],
			},
		});

		const result = await t.replay({ limit: 10 }, span);

		expect(result.status).toBe("replayed");
		expect(t.abandonExhaustedEntries).toHaveBeenCalled();
	});

	it("reports an unresolved message-manager without claiming anything", async () => {
		const t = setup({ url: null });

		await expect(t.replay({ limit: 10 }, span)).resolves.toEqual({
			status: "message-manager-unresolved",
		});
		expect(t.claimEntriesForRetry).not.toHaveBeenCalled();
	});

	it("reports an empty claim without replaying", async () => {
		const t = setup({ claimed: [] });

		await expect(t.replay({ limit: 10 }, span)).resolves.toEqual({
			status: "no-entries",
		});
		expect(t.replayBatch).not.toHaveBeenCalled();
		expect(t.notifyReplay).not.toHaveBeenCalled();
	});
});
