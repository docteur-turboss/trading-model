import { randomUUID } from "node:crypto";

import { SpanStatusCode } from "@opentelemetry/api";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { z } from "zod";
import { notifyAudit } from "../config/audit";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { metrics } from "../config/metrics";
import { dlqClaimManager } from "./claim-manager";
import { dlqRetryManager } from "./retry-manager";
import {
	getHttpClient,
	isMMCircuitOpen,
	isShuttingDown,
	recordMMResult,
	resolveMessageManagerUrl,
} from "./shared/index";

interface ReplayContext {
	client: import("@trading-model/common/config/http-client").HttpClient;
	messageManagerUrl: string;
	batchId: string;
	instanceId: string;
	isTimedOut: () => boolean;
	successCount: { value: number };
	errors: Array<{ id: string; error: string }>;
}

interface DeliveryFailureContext {
	entryId: string;
	instanceId: string;
	batchId: string;
	httpError: string;
}

interface ProcessBatchResultsOptions {
	batch: Array<{ id: string; message: unknown }>;
	batchResults: PromiseSettledResult<void>[];
	ctx: Pick<ReplayContext, "batchId" | "successCount" | "errors">;
}

interface ReplayBatchOptions {
	entries: Array<{ id: string; message: unknown }>;
	messageManagerUrl: string;
	batchId: string;
	instanceId: string;
}

interface ClaimAndReplayOptions {
	messageManagerUrl: string;
	limit: number;
	batchId: string;
	topic: string | undefined;
	span: import("@opentelemetry/api").Span;
}

interface DlqEntryRef {
	id: string;
	message: unknown;
}

interface DlqError {
	id: string;
	error: string;
}

const ReplaySchema = z.object({
	topic: z.string().optional(),
	limit: z.coerce.number().int().positive().max(100).default(50),
	batchId: z.string().optional(),
});

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
	ctxBase: { client: import("@trading-model/common/config/http-client").HttpClient; messageManagerUrl: string; batchId: string; instanceId: string }
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
			{ batchId, entryCount: entries.length }
		);
		return _rejectAll(entries, "Message-manager circuit breaker open");
	}

	activeBatches++;
	try {
		const client = await getHttpClient();
		const { success, errors } = await _runBatchWithTimeout(entries, {
			client,
			messageManagerUrl,
			batchId,
			instanceId,
		});

		recordMMResult(success > 0);
		return { success, errors };
	} finally {
		activeBatches--;
	}
}

function validateReplayQuery(
	query: unknown,
	span: import("@opentelemetry/api").Span
):
	| { valid: false; response: ResponseObject }
	| { valid: true; data: z.infer<typeof ReplaySchema> } {
	const parsed = ReplaySchema.safeParse(query);
	if (!parsed.success) {
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: parsed.error.message,
		});
		span.end();
		return {
			valid: false,
			response: sendResponse({ error: parsed.error.message }, 400),
		};
	}
	span.setAttribute("topic", parsed.data.topic ?? "all");
	span.setAttribute("limit", parsed.data.limit);
	return { valid: true, data: parsed.data };
}

async function resolveMMUrlOrFail(
	span: import("@opentelemetry/api").Span
): Promise<string | null> {
	const messageManagerUrl = await resolveMessageManagerUrl();
	if (!messageManagerUrl) {
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: "Cannot resolve message-manager URL",
		});
		span.end();
		return null;
	}
	return messageManagerUrl;
}

export async function abandonExhaustedIfNeeded(
	errors: DlqError[]
): Promise<void> {
	if (errors.length === 0) {
		return;
	}
	const abandoned = await dlqRetryManager.abandonExhaustedEntries();
	if (abandoned > 0) {
		logger.warn(
			`DLQ manual replay: ${abandoned} entries abandoned after max retries`
		);
	}
}

function buildReplayResponse(
	batchId: string,
	successCount: number,
	errors: DlqError[]
): Record<string, unknown> {
	const details: Record<string, unknown> = _buildReplayDetails(
		batchId,
		successCount,
		errors
	);
	_emitReplayMetrics(successCount, errors.length);
	return details;
}

function _buildReplayDetails(
	batchId: string,
	successCount: number,
	errors: DlqError[]
): Record<string, unknown> {
	const details: Record<string, unknown> = {
		batchId,
		replayed: successCount,
		failed: errors.length,
	};
	if (errors.length > 0) {
		details.errors = errors;
	}
	return details;
}

function _emitReplayMetrics(successCount: number, errorsCount: number): void {
	if (successCount > 0) {
		metrics.entriesReplayed.inc(successCount);
	}
	if (errorsCount > 0) {
		metrics.entriesReplayFailed.inc(errorsCount);
	}
}

async function _claimAndReplayBatch(
	options: ClaimAndReplayOptions
): Promise<{
	response: ResponseObject | null;
	successCount: number;
	errors: DlqError[];
}> {
	const { messageManagerUrl, limit, batchId, topic, span } = options;
	await dlqClaimManager.releaseStaleClaims();
	const entries = await dlqClaimManager.claimEntriesForRetry({
		limit,
		batchId,
		instanceId: env.INSTANCE_ID,
		topic,
	});

	if (entries.length === 0) {
		return {
			response: sendResponse(
				{ replayed: 0, message: "No entries available for retry" },
				200
			),
			successCount: 0,
			errors: [],
		};
	}

	span.setAttribute("entriesClaimed", entries.length);

	const { success: successCount, errors } = await doReplayBatch({
		entries: entries.map((entry) => ({
			id: entry.id,
			message: entry.message,
		})),
		messageManagerUrl,
		batchId,
		instanceId: env.INSTANCE_ID,
	});

	await abandonExhaustedIfNeeded(errors);

	span.setAttribute("replayed", successCount);
	span.setAttribute("failed", errors.length);

	return { response: null, successCount, errors };
}

export async function executeReplayPipeline(
	query: unknown,
	span: import("@opentelemetry/api").Span
): Promise<ResponseObject> {
	const validation = validateReplayQuery(query, span);
	if (!validation.valid) {
		return validation.response;
	}

	const messageManagerUrl = await resolveMMUrlOrFail(span);
	if (!messageManagerUrl) {
		return sendResponse(
			{
				error:
					"Cannot resolve message-manager URL (no env var, no address-manager)",
			},
			500
		);
	}

	const batchId = validation.data.batchId || randomUUID();
	span.setAttribute("batchId", batchId);

	const {
		response: earlyResponse,
		successCount,
		errors,
	} = await _claimAndReplayBatch({
		messageManagerUrl,
		limit: validation.data.limit,
		batchId,
		topic: validation.data.topic,
		span,
	});
	if (earlyResponse) {
		return earlyResponse;
	}

	const details = buildReplayResponse(batchId, successCount, errors);

	void notifyAudit({
		timestamp: new Date().toISOString(),
		topic: validation.data.topic ?? "unknown",
		publisher: "dlq-service",
		correlationId: batchId,
		summary: `DLQ replay: ${successCount} succeeded, ${errors.length} failed`,
		severity: errors.length > 0 ? "ERROR" : "INFO",
	});

	return sendResponse(details, 200);
}
