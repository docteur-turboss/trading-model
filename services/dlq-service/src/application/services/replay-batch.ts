import { PositiveInt, toMessageId } from "@trading-model/primitives/primitives";
import { logger } from "../../config/logger";
import type { EntryDeliveryPort } from "../../domain/ports/replay.ports";
import type {
	BatchReplayContext,
	BatchResults,
	DlqEntryRef,
	DlqError,
	ReplayBatchOptions,
} from "../../shared/types";
import {
	checkBatchRejection,
	decrementActiveBatches,
	incrementActiveBatches,
	recordBatchResult,
} from "./batch-concurrency-guard";

function isRejected<TValue>(
	result: PromiseSettledResult<TValue>
): result is PromiseRejectedResult {
	return result.status === "rejected";
}

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
		if (isRejected(result)) {
			_recordFailedEntry(entry, result, ctx);
		}
	}
}

function _recordFailedEntry(
	entry: DlqEntryRef | undefined,
	result: PromiseSettledResult<void>,
	ctx: ProcessBatchResultsOptions["ctx"]
): void {
	const errorMsg = isRejected(result)
		? ((result.reason as Error)?.message ?? "unknown error")
		: "unknown error";
	ctx.errors.push({
		id: entry?.id ?? toMessageId("unknown"),
		error: errorMsg,
	});
	logger.error("DLQ replay entry failed", {
		entryId: entry?.id,
		error: errorMsg,
		batchId: ctx.batchId,
	});
}

function waitForBatchTimeout(
	batchId: string,
	timeoutMs: number,
	onTimeout: () => void
): Promise<void> {
	return new Promise<void>((resolve) => {
		setTimeout(() => {
			onTimeout();
			logger.warn(
				"DLQ batch replay timeout — stopping new requests, waiting for in-flight",
				{ batchId }
			);
			resolve();
		}, timeoutMs);
	});
}

async function _runBatchWithTimeout(
	entries: DlqEntryRef[],
	ctxBase: BatchReplayContext,
	delivery: EntryDeliveryPort
): Promise<BatchResults> {
	const ReplayConcurrency = PositiveInt.of(10);
	const ReplayBatchTimeoutMs = 120_000;

	const { ctx, setTimedOut } = _createReplayContext(ctxBase, delivery);

	const batchLoop = runBatchLoop(entries, ctx, ReplayConcurrency);
	const timeoutPromise = waitForBatchTimeout(
		ctxBase.batchId,
		ReplayBatchTimeoutMs,
		setTimedOut
	);

	await Promise.race([batchLoop, timeoutPromise]);

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
		logger.debug("Batch loop error already handled internally");
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
	const rejection = checkBatchRejection(options.entries, options.batchId);
	if (rejection) {
		return rejection;
	}

	incrementActiveBatches();
	try {
		return await _executeBatch(options, delivery);
	} finally {
		decrementActiveBatches();
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
