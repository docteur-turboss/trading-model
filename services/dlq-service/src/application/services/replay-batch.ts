import { getLogger } from "@trading-model/contracts/logger-registry";
import { PositiveInt, toMessageId } from "@trading-model/primitives/primitives";
import { REPLAY_BATCH_TIMEOUT_MS } from "../../domain/dlq-constants";
import type { EntryDeliveryPort } from "../../domain/ports/replay.port";
import type {
	BatchReplayContext,
	BatchResults,
	DlqEntryRef,
	DlqError,
	ReplayBatchOptions,
} from "../../shared/types";
import { activeReplays } from "./active-replay-counter";
import {
	checkBatchRejection,
	recordBatchResult,
} from "./batch-concurrency-guard";

export interface ReplayContext extends BatchReplayContext {
	delivery: EntryDeliveryPort;
	isTimedOut: () => boolean;
	successCount: { value: number };
	errors: DlqError[];
}

export interface ProcessBatchResultsOptions {
	batch: DlqEntryRef[];
	batchResults: PromiseSettledResult<void>[];
	ctx: Pick<ReplayContext, "batchId" | "successCount" | "errors">;
}

async function replaySingleEntry(
	entry: DlqEntryRef,
	ctx: ReplayContext
): Promise<void> {
	await ctx.delivery.deliver(entry, {
		batchId: ctx.batchId,
		instanceId: ctx.instanceId,
		messageManagerUrl: ctx.messageManagerUrl,
	});
	ctx.successCount.value++;
}

async function runBatchLoop(
	entries: DlqEntryRef[],
	ctx: ReplayContext,
	concurrency: PositiveInt
): Promise<void> {
	for (let i = 0; i < entries.length && !ctx.isTimedOut(); i += concurrency) {
		const batch = entries.slice(i, i + concurrency);
		const batchResults = await Promise.allSettled(
			batch.map((entry) => replaySingleEntry(entry, ctx))
		);
		processBatchResults({ batch, batchResults, ctx });
	}
}

function processBatchResults(options: ProcessBatchResultsOptions): void {
	const { batch, batchResults, ctx } = options;
	for (const [idx, result] of batchResults.entries()) {
		const entry = batch[idx];
		if (result.status === "rejected") {
			_recordFailedEntry(entry, result, ctx);
		}
	}
}

function _recordFailedEntry(
	entry: DlqEntryRef | undefined,
	result: PromiseRejectedResult,
	ctx: ProcessBatchResultsOptions["ctx"]
): void {
	const errorMsg = (result.reason as Error)?.message ?? "unknown error";
	ctx.errors.push({
		id: entry?.id ?? toMessageId("unknown"),
		error: errorMsg,
	});
	getLogger().error("DLQ replay entry failed", {
		entryId: entry?.id,
		error: errorMsg,
		batchId: ctx.batchId,
	});
}

function waitForBatchTimeout(
	batchId: string,
	timeoutMs: number,
	onTimeout: () => void
): { promise: Promise<void>; cancel: () => void } {
	let handle: ReturnType<typeof setTimeout> | undefined;
	const promise = new Promise<void>((resolve) => {
		handle = setTimeout(() => {
			onTimeout();
			getLogger().warn(
				"DLQ batch replay timeout — stopping new requests, waiting for in-flight",
				{ batchId }
			);
			resolve();
		}, timeoutMs);
	});
	return { promise, cancel: () => clearTimeout(handle) };
}

async function _runBatchWithTimeout(
	entries: DlqEntryRef[],
	ctxBase: BatchReplayContext,
	delivery: EntryDeliveryPort
): Promise<BatchResults> {
	const ReplayConcurrency = PositiveInt.of(10);

	const { ctx, setTimedOut } = _createReplayContext(ctxBase, delivery);

	const batchLoop = runBatchLoop(entries, ctx, ReplayConcurrency);
	const timeout = waitForBatchTimeout(
		ctxBase.batchId,
		REPLAY_BATCH_TIMEOUT_MS,
		setTimedOut
	);

	try {
		await Promise.race([batchLoop, timeout.promise]);
	} finally {
		timeout.cancel();
	}

	if (ctx.isTimedOut()) {
		await _drainBatchLoop(batchLoop);
	}

	return { success: ctx.successCount.value, errors: ctx.errors };
}

function _createReplayContext(
	ctxBase: BatchReplayContext,
	delivery: EntryDeliveryPort
): {
	ctx: ReplayContext;
	setTimedOut: () => void;
} {
	let batchTimedOut = false;
	const successCount = { value: 0 };
	const errors: DlqError[] = [];
	return {
		ctx: {
			...ctxBase,
			delivery,
			isTimedOut: () => batchTimedOut,
			successCount,
			errors,
		},
		setTimedOut: () => {
			batchTimedOut = true;
		},
	};
}

async function _drainBatchLoop(batchLoop: Promise<void>): Promise<void> {
	try {
		await batchLoop;
	} catch {
		getLogger().debug("Batch loop error already handled internally");
	}
}

export type {
	BatchResults,
	DlqEntryRef,
	DlqError,
	ReplayBatchOptions,
} from "../../shared/types";

/** Builds the batch replay use case on top of an entry delivery port. */
export function createReplayBatch(
	delivery: EntryDeliveryPort
): (options: ReplayBatchOptions) => Promise<BatchResults> {
	return (options) => _replayBatch(options, delivery);
}

async function _replayBatch(
	options: ReplayBatchOptions,
	delivery: EntryDeliveryPort
): Promise<BatchResults> {
	const rejection = checkBatchRejection(options.entries);
	if (rejection) {
		return rejection;
	}

	activeReplays.increment();
	try {
		return await _executeBatch(options, delivery);
	} finally {
		activeReplays.decrement();
	}
}

async function _executeBatch(
	options: ReplayBatchOptions,
	delivery: EntryDeliveryPort
): Promise<BatchResults> {
	const { success, errors } = await _runBatchWithTimeout(
		options.entries,
		{
			messageManagerUrl: options.messageManagerUrl,
			batchId: options.batchId,
			instanceId: options.instanceId,
		},
		delivery
	);
	recordBatchResult(success);
	return { success, errors };
}
