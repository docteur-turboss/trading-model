import { logger } from "../config/logger";
import { dlqClaimManager } from "./claim-manager";
import { dlqRetryManager } from "./retry-manager";
import {
	getHttpClient,
	isMMCircuitOpen,
	isShuttingDown,
	recordMMResult,
} from "./shared/index";

export interface ReplayContext {
	client: import("@trading-model/common/config/http-client").HttpClient;
	messageManagerUrl: string;
	batchId: string;
	instanceId: string;
	isTimedOut: () => boolean;
	successCount: { value: number };
	errors: Array<{ id: string; error: string }>;
}

export interface DeliveryFailureContext {
	entryId: string;
	instanceId: string;
	batchId: string;
	httpError: string;
}

export interface ProcessBatchResultsOptions {
	batch: Array<{ id: string; message: unknown }>;
	batchResults: PromiseSettledResult<void>[];
	ctx: Pick<ReplayContext, "batchId" | "successCount" | "errors">;
}

export interface ReplayBatchOptions {
	entries: Array<{ id: string; message: unknown }>;
	messageManagerUrl: string;
	batchId: string;
	instanceId: string;
}

export interface DlqEntryRef {
	id: string;
	message: unknown;
}

export interface DlqError {
	id: string;
	error: string;
}

let activeBatches = 0;
const MAX_CONCURRENT_BATCHES = 2;

async function _deliverMessage(
	entry: DlqEntryRef,
	messageManagerUrl: string,
	client: import("@trading-model/common/config/http-client").HttpClient
): Promise<void> {
	if (isShuttingDown()) {
		throw new Error("Server shutting down");
	}
	await client.post(`${messageManagerUrl}/message`, entry.message, {
		timeoutMs: 10_000,
		serviceName: "message-manager" as never,
		retryCount: 3,
	});
}

async function _handleDeliveryMarkFailed(
	options: DeliveryFailureContext
): Promise<void> {
	const { entryId, instanceId, batchId, httpError } = options;
	try {
		await dlqRetryManager.markRetried({
			id: entryId,
			instanceId,
			batchId,
			success: false,
			errorMsg: httpError,
		});
	} catch (markErr) {
		await _forceReleaseClaim(entryId, markErr);
	}
}

async function _forceReleaseClaim(
	entryId: string,
	markErr: unknown
): Promise<void> {
	logger.error(
		"Failed to mark entry as failed — releasing claim without count",
		{ entryId, error: (markErr as Error).message }
	);
	await dlqClaimManager.incrementRetryCount(entryId).catch((err) => {
		logger.error(
			"CRITICAL: Failed to increment retryCount after markRetried failure",
			{ entryId, error: (err as Error).message }
		);
	});
	await dlqClaimManager.releaseClaimWithoutCount(entryId).catch((err) => {
		logger.error("CRITICAL: Failed to release claim after error", {
			entryId,
			error: (err as Error).message,
		});
	});
}

async function replaySingleEntry(
	entry: DlqEntryRef,
	ctx: ReplayContext
): Promise<void> {
	ctx.successCount.value++;
	try {
		await _deliverMessage(entry, ctx.messageManagerUrl, ctx.client);
		await _markEntrySuccess(entry, ctx);
	} catch (err) {
		if (ctx.isTimedOut()) {
			throw err;
		}
		await _handleEntryFailure(entry, ctx, err);
		throw err;
	}
}

async function _markEntrySuccess(
	entry: DlqEntryRef,
	ctx: ReplayContext
): Promise<void> {
	await dlqRetryManager.markRetried({
		id: entry.id,
		instanceId: ctx.instanceId,
		batchId: ctx.batchId,
		success: true,
	});
}

async function _handleEntryFailure(
	entry: DlqEntryRef,
	ctx: ReplayContext,
	err: unknown
): Promise<void> {
	const httpError = (err as Error).message;
	await _handleDeliveryMarkFailed({
		entryId: entry.id,
		instanceId: ctx.instanceId,
		batchId: ctx.batchId,
		httpError,
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
	ctx.errors.push({
		id: entry?.id ?? "unknown",
		error: (result.reason as Error)?.message ?? "unknown error",
	});
	logger.error("DLQ replay entry failed", {
		entryId: entry?.id,
		error: (result.reason as Error)?.message,
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
	ctxBase: {
		client: import("@trading-model/common/config/http-client").HttpClient;
		messageManagerUrl: string;
		batchId: string;
		instanceId: string;
	}
): Promise<{ success: number; errors: DlqError[] }> {
	const ReplayConcurrency = 10;
	const ReplayBatchTimeoutMs = 120_000;
	let batchTimedOut = false;
	const successCount = { value: 0 };
	const errors: DlqError[] = [];
	const ctx: ReplayContext = {
		...ctxBase,
		isTimedOut: () => batchTimedOut,
		successCount,
		errors,
	};

	const batchLoop = runBatchLoop(entries, ctx, ReplayConcurrency);

	const timeoutPromise = waitForBatchTimeout(
		ctxBase.batchId,
		ReplayBatchTimeoutMs,
		() => {
			batchTimedOut = true;
		}
	);

	await Promise.race([batchLoop, timeoutPromise]);

	if (batchTimedOut) {
		try {
			await batchLoop;
		} catch {
			// errors handled internally
		}
	}

	return { success: successCount.value, errors };
}

export async function doReplayBatch(
	options: ReplayBatchOptions
): Promise<{ success: number; errors: DlqError[] }> {
	const { entries, messageManagerUrl, batchId, instanceId } = options;
	const rejection = _checkBatchRejection(entries, batchId);
	if (rejection) {
		return rejection;
	}

	activeBatches++;
	try {
		return await _executeBatch(entries, messageManagerUrl, batchId, instanceId);
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
	if (isMMCircuitOpen() && entries.length > 0) {
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
	entries: DlqEntryRef[],
	messageManagerUrl: string,
	batchId: string,
	instanceId: string
): Promise<{ success: number; errors: DlqError[] }> {
	const client = await getHttpClient();
	const { success, errors } = await _runBatchWithTimeout(entries, {
		client,
		messageManagerUrl,
		batchId,
		instanceId,
	});
	recordMMResult(success > 0);
	return { success, errors };
}
