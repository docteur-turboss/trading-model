import { logger } from "../config/logger";
import { MessageManagerCircuitBreaker } from "../config/mm-circuit-breaker";
import { deliverEntry } from "./delivery-executor";
import { getHttpClient } from "./shared/http-client-manager";
import type {
	BatchReplayContext,
	DlqEntryRef,
	DlqError,
	ReplayBatchOptions,
} from "./types";

const MmCircuitBreaker = new MessageManagerCircuitBreaker({
	name: "replay-batch",
});

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

let activeBatches = 0;
const MAX_CONCURRENT_BATCHES = 2;

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
		await _handleEntryFailure(entry, ctx, err);
		throw err;
	}
}

async function _handleEntryFailure(
	entry: DlqEntryRef,
	ctx: ReplayContext,
	err: unknown
): Promise<void> {
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

function _rejectAll(
	entries: DlqEntryRef[],
	error: string
): { success: number; errors: DlqError[] } {
	return {
		success: 0,
		errors: entries.map((entry) => ({ id: entry.id, error })),
	};
}

async function _runBatchWithTimeout(
	entries: DlqEntryRef[],
	ctxBase: BatchReplayContext
): Promise<{ success: number; errors: DlqError[] }> {
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

export type { DlqEntryRef, DlqError, ReplayBatchOptions } from "./types";

export async function doReplayBatch(
	options: ReplayBatchOptions
): Promise<{ success: number; errors: DlqError[] }> {
	const rejection = _checkBatchRejection(options.entries, options.batchId);
	if (rejection) {
		return rejection;
	}

	activeBatches++;
	try {
		return await _executeBatch(options);
	} finally {
		activeBatches--;
	}
}

function _checkBatchRejection(
	entries: DlqEntryRef[],
	batchId: string
): { success: number; errors: DlqError[] } | null {
	if (activeBatches >= MAX_CONCURRENT_BATCHES) {
		logger.warn("Too many concurrent replay batches — rejecting", {
			batchId,
			entryCount: entries.length,
			activeBatches,
		});
		return _rejectAll(entries, "Too many concurrent replay batches");
	}
	if (MmCircuitBreaker.isOpen() && entries.length > 0) {
		logger.warn(
			"Message-manager circuit breaker open — rejecting replay batch",
			{
				batchId,
				entryCount: entries.length,
			}
		);
		return _rejectAll(entries, "Message-manager circuit breaker open");
	}
	return null;
}

async function _executeBatch(
	options: ReplayBatchOptions
): Promise<{ success: number; errors: DlqError[] }> {
	const client = await getHttpClient();
	const { success, errors } = await _runBatchWithTimeout(options.entries, {
		client,
		messageManagerUrl: options.messageManagerUrl,
		batchId: options.batchId,
		instanceId: options.instanceId,
	});
	if (success > 0) {
		MmCircuitBreaker.recordSuccess();
	} else {
		MmCircuitBreaker.recordFailure();
	}
	return { success, errors };
}
