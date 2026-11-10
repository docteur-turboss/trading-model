import { describe, expect, it, jest } from "@jest/globals";
import type { Span } from "@opentelemetry/api";
import { logger } from "@trading-model/http/infrastructure/logger";
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
} from "../../src/domain/ports/replay.port";
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
		auditRecorded?: boolean;
		abandoned?: number;
	} = {}
) {
	const resolve = jest.fn<() => Promise<URLString | null>>(async () =>
		overrides.url === undefined ? MM_URL : overrides.url
	);
	const claimEntriesForRetry = jest.fn<
		(options: ClaimEntriesOptions) => Promise<ClaimedEntry[]>
	>(async () => overrides.claimed ?? CLAIMED);
	const abandonExhaustedEntries = jest.fn<() => Promise<number>>(
		async () => overrides.abandoned ?? 0
	);
	const releaseStaleClaims = jest.fn<() => Promise<number>>(async () => 0);
	const replayBatch = jest.fn<
		(options: ReplayBatchOptions) => Promise<BatchResults>
	>(async () => overrides.batch ?? { success: 1, errors: [] });
	const notifyReplay = jest.fn<(...args: any[]) => Promise<boolean>>(
		async () => overrides.auditRecorded ?? true
	);
	const batchReplayed = jest.fn<(success: number, failed: number) => void>();
	const deps: ReplayEntriesDeps = {
		messageManager: { resolve },
		claimRelease: { releaseStaleClaims },
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
		releaseStaleClaims,
		abandonExhaustedEntries,
		replayBatch,
		notifyReplay,
		batchReplayed,
	};
}

describe("replay use case", () => {
	it("claims, replays, counts and audits a batch", async () => {
		const t = setup();

		const result = await t.replay(
			{ limit: 10, batchId: "b1", actor: "ops-alice" },
			span
		);

		expect(result).toEqual({
			status: "replayed",
			details: { batchId: "b1", replayed: 1, failed: 0 },
			auditRecorded: true,
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
			expect.objectContaining({
				batchId: "b1",
				success: 1,
				failed: 0,
				actor: "ops-alice",
			})
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

		const result = await t.replay({ limit: 10, actor: null }, span);

		expect(result.status).toBe("replayed");
		expect(t.abandonExhaustedEntries).toHaveBeenCalled();
	});

	it("reports a replay whose audit event message-manager refused", async () => {
		const t = setup({ auditRecorded: false });

		const result = await t.replay({ limit: 10, actor: "ops-alice" }, span);

		expect(result).toMatchObject({ status: "replayed", auditRecorded: false });
	});

	it("reports an unresolved message-manager without claiming anything", async () => {
		const t = setup({ url: null });

		await expect(t.replay({ limit: 10, actor: null }, span)).resolves.toEqual({
			status: "message-manager-unresolved",
		});
		expect(t.claimEntriesForRetry).not.toHaveBeenCalled();
	});

	it("reports an empty claim without replaying", async () => {
		const t = setup({ claimed: [] });

		await expect(t.replay({ limit: 10, actor: null }, span)).resolves.toEqual({
			status: "no-entries",
		});
		expect(t.replayBatch).not.toHaveBeenCalled();
		expect(t.notifyReplay).not.toHaveBeenCalled();
	});

	it("generates a batchId when the request has none", async () => {
		const t = setup();

		const result = await t.replay({ limit: 10, actor: null }, span);

		const batchId = (result as unknown as { details: { batchId: string } })
			.details.batchId;
		expect(batchId).toMatch(/^[0-9a-f-]{36}$/);
		expect(t.replayBatch).toHaveBeenCalledWith(
			expect.objectContaining({ batchId })
		);
	});

	it("releases stale claims before claiming, for the requested topic", async () => {
		const t = setup();
		const order: string[] = [];
		t.releaseStaleClaims.mockImplementation(async () => {
			order.push("release");
			return 0;
		});
		t.claimEntriesForRetry.mockImplementation(async () => {
			order.push("claim");
			return CLAIMED;
		});

		await t.replay({ limit: 10, topic: "t1" as never, actor: null }, span);

		expect(order).toEqual(["release", "claim"]);
		expect(t.claimEntriesForRetry).toHaveBeenCalledWith(
			expect.objectContaining({ instanceId: INSTANCE, topic: "t1" })
		);
	});

	it("warns with the abandoned count and audits the failures", async () => {
		const warn = logger.warn as jest.Mock;
		warn.mockClear();
		const t = setup({
			abandoned: 2,
			batch: {
				success: 0,
				errors: [{ id: toMessageId("e1"), error: "timeout" }],
			},
		});

		await t.replay({ limit: 10, batchId: "b2", actor: null }, span);

		expect(t.abandonExhaustedEntries).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("2 entries abandoned after max retries")
		);
		expect(t.notifyReplay).toHaveBeenCalledWith(
			expect.objectContaining({ batchId: "b2", success: 0, failed: 1 })
		);
	});

	it("does not warn when nothing was abandoned", async () => {
		const warn = logger.warn as jest.Mock;
		warn.mockClear();
		const t = setup({
			batch: { success: 0, errors: [{ id: toMessageId("e1"), error: "x" }] },
		});

		await t.replay({ limit: 10, actor: null }, span);

		expect(warn).not.toHaveBeenCalled();
	});
});
