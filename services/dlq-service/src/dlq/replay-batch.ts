import { logger } from "../config/logger";
import {
	checkBatchRejection,
	decrementActiveBatches,
	incrementActiveBatches,
	recordBatchResult,
} from "./batch-concurrency-guard";
import { deliverEntry } from "./delivery-executor";
import { getHttpClient } from "./shared/http-client-manager";
import type {
	BatchReplayContext,
	BatchResult,
	DlqEntryRef,
	DlqError,
	ReplayBatchOptions,
} from "./types";

export interface ReplayContext extends BatchReplayContext {
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
	ctx.successCount.value++;
	try {
		await deliverEntry(entry, ctx);
	} catch (err) {
		if (ctx.isTimedOut()) {
			throw err;
		}
		_handleEntryFailure(entry, ctx, err);
		throw err;
	}
}

function _handleEntryFailure(
	entry: DlqEntryRef,
	ctx: ReplayContext,
	err: unknown
): void {
	const httpError = (err as Error).message;
	ctx.errors.push({
		id: entry.id,
		error: httpError,
	});
	logger.error("DLQ replay entry failed", {
		entryId: entry.id,
		error: httpError,
		batchId: ctx.batchId,
	});
}

async function runBatchLoop(
	entries: DlqEntryRef[],
	ctx: ReplayContext,
	concurrency: number
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
	for (let idx = 0; idx < batchResults.length; idx++) {
		const result = batchResults[idx];
		const entry = batch[idx];
		if (result.status === "rejected") {
			_recordFailedEntry(entry, result, ctx);
		}
	}
}

function _recordFailedEntry(
	entry: { id: string; message: unknown } | undefined,
	result: PromiseSettledResult<void>,
	ctx: ProcessBatchResultsOptions["ctx"]
): void {
	const errorMsg =
		result.status === "rejected"
			? ((result.reason as Error)?.message ?? "unknown error")
			: "unknown error";
	ctx.errors.push({
		id: entry?.id ?? "unknown",
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
	ctxBase: BatchReplayContext
): Promise<BatchResult> {
	const ReplayConcurrency = 10;
	const ReplayBatchTimeoutMs = 120_000;

	const { ctx, setTimedOut } = _createReplayContext(ctxBase);

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

function _createReplayContext(ctxBase: BatchReplayContext): {
	ctx: ReplayContext;
	setTimedOut: () => void;
} {
	let batchTimedOut = false;
	const successCount = { value: 0 };
	const errors: DlqError[] = [];
	return {
		ctx: {
			...ctxBase,
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
	BatchResult,
	DlqEntryRef,
	DlqError,
	ReplayBatchOptions,
} from "./types";

export async function doReplayBatch(
	options: ReplayBatchOptions
): Promise<BatchResult> {
	const rejection = checkBatchRejection(options.entries, options.batchId);
	if (rejection) {
		return rejection;
	}

	incrementActiveBatches();
	try {
		return await _executeBatch(options);
	} finally {
		decrementActiveBatches();
	}
}

async function _executeBatch(
	options: ReplayBatchOptions
): Promise<BatchResult> {
	const client = await getHttpClient();
	const { success, errors } = await _runBatchWithTimeout(options.entries, {
		client,
		messageManagerUrl: options.messageManagerUrl,
		batchId: options.batchId,
		instanceId: options.instanceId,
	});
	recordBatchResult(success);
	return { success, errors };
}
