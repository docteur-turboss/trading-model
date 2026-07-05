import { randomUUID } from "node:crypto";

import { SpanStatusCode, trace } from "@opentelemetry/api";
import { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { normalizeError } from "@trading-model/common/utils/errors";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { findAService } from "../config/address-manager";
import { notifyAudit } from "../config/audit";
import { getMissingCriticalIndexes, isDbConnected } from "../config/db";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { metrics } from "../config/metrics";
import { dlqRedisQueue } from "../config/redis-queue";
import { dlqClaimManager } from "./claim-manager";
import { DlqCapacityError, dlqRepository } from "./repository";
import { dlqRetryManager } from "./retry-manager";

const tracer = trace.getTracer("dlq-service");

const MAX_MESSAGE_BYTES = 5 * 1024 * 1024;

const DlqEntrySchema = z.object({
	topic: z.string().optional(),
	message: z.unknown(),
	reason: z.string().optional(),
	deliveryAttempt: z.number().int(),
	timestamp: z.string(),
	messageId: z.string().optional(),
});

const DeleteSchema = z.object({
	ids: z.array(z.string()).min(1).max(1000),
});

const ReplaySchema = z.object({
	topic: z.string().optional(),
	limit: z.coerce.number().int().positive().max(100).default(50),
	batchId: z.string().optional(),
});

let httpClient: HttpClient | null = null;
let httpClientPromise: Promise<HttpClient> | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;
let autoRetryTimer: ReturnType<typeof setTimeout> | null = null;
let autoRetryStartTimer: ReturnType<typeof setTimeout> | null = null;
let redisRetryTimer: ReturnType<typeof setTimeout> | null = null;
export class ActiveReplayCounter {
	private _count = 0;
	get count(): number {
		return this._count;
	}
	increment(): void {
		this._count++;
	}
	decrement(): void {
		if (this._count > 0) {
			this._count--;
		}
	}
}
export const activeReplays = new ActiveReplayCounter();
let activeBatches = 0;
const MAX_CONCURRENT_BATCHES = 2;
let shuttingDown = false;

interface BatchReplayContext {
	client: HttpClient;
	messageManagerUrl: string;
	batchId: string;
	instanceId: string;
}

interface BatchResults {
	successCount: { value: number };
	errors: Array<{ id: string; error: string }>;
}

interface BatchLoopOptions {
	entries: Array<{ id: string; message: unknown }>;
	ctx: BatchReplayContext;
	concurrency: number;
	isTimedOut: () => boolean;
	batchResults: BatchResults;
}

interface ProcessBatchResultsOptions {
	batch: Array<{ id: string; message: unknown }>;
	batchResults: PromiseSettledResult<void>[];
	ctx: Pick<BatchReplayContext, "batchId">;
	results: BatchResults;
}

interface ReplayBatchOptions {
	entries: Array<{ id: string; message: unknown }>;
	messageManagerUrl: string;
	batchId: string;
	instanceId: string;
}

interface ReplayAuditInfo {
	batchId: string;
	topic: string | undefined;
	success: number;
	failed: number;
}

interface ClaimAndReplayOptions {
	messageManagerUrl: string;
	limit: number;
	batchId: string;
	topic: string | undefined;
	span: import("@opentelemetry/api").Span;
}

async function getHttpClient(): Promise<HttpClient> {
	if (httpClient) {
		return httpClient;
	}
	const existingClient =
		httpClientPromise === null ? null : await httpClientPromise;
	if (existingClient) {
		return existingClient;
	}

	httpClientPromise = (() => {
		const client = new HttpClient({
			ca: env.TLS_CA_PATH,
			cert: env.TLS_CERT_PATH,
			key: env.TLS_KEY_PATH,
		});
		httpClient = client;
		return Promise.resolve(client);
	})();

	return httpClientPromise;
}

export async function reloadHttpClientTls(): Promise<void> {
	const client = httpClient as { reloadTlsPaths?: () => Promise<void> } | null;
	if (client && typeof client.reloadTlsPaths === "function") {
		try {
			await client.reloadTlsPaths();
			logger.info("HTTP client TLS certificates reloaded");
		} catch (err) {
			logger.error("Failed to reload HTTP client TLS certificates", {
				error: (err as Error).message,
			});
		}
	}
}

export function closeHttpClient(): Promise<void> {
	httpClient = null;
	httpClientPromise = null;
	return Promise.resolve();
}

async function resolveMessageManagerUrl(): Promise<string | null> {
	let url: string | null = env.MESSAGE_MANAGER_URL ?? null;
	if (!url) {
		try {
			const target = await findAService(
				ServiceInstanceName.MessageDeliveryService
			);
			if (target) {
				url = `https://${target.ip}:${target.port}`;
			}
		} catch {
			logger.warn("DLQ address-manager resolution failed");
		}
	}
	return url;
}

let mmCircuitFailures = 0;
let mmCircuitOpenUntil = 0;
let mmHalfOpenAttempts = 0;
const MM_CIRCUIT_THRESHOLD = 5;
const MM_CIRCUIT_RESET_MS = 30_000;
const MM_CIRCUIT_HALF_OPEN_MAX_ATTEMPTS = 2;

function isMMCircuitOpen(): boolean {
	if (mmCircuitOpenUntil > Date.now()) {
		return true;
	}
	if (mmCircuitOpenUntil > 0) {
		mmCircuitFailures = 0;
		mmCircuitOpenUntil = 0;
		mmHalfOpenAttempts = 0;
	}
	return false;
}

function recordMMResult(success: boolean): void {
	if (success) {
		if (mmCircuitFailures > 0) {
			mmCircuitFailures = 0;
		}
		mmCircuitOpenUntil = 0;
		mmHalfOpenAttempts = 0;
	} else {
		mmCircuitFailures++;
		if (mmCircuitOpenUntil > 0) {
			mmHalfOpenAttempts++;
			if (mmHalfOpenAttempts >= MM_CIRCUIT_HALF_OPEN_MAX_ATTEMPTS) {
				mmCircuitOpenUntil = Date.now() + MM_CIRCUIT_RESET_MS;
				logger.warn(
					"Message-manager circuit breaker re-opened during half-open",
					{
						failures: mmCircuitFailures,
						halfOpenAttempts: mmHalfOpenAttempts,
						resetMs: MM_CIRCUIT_RESET_MS,
					}
				);
			}
		}
		if (mmCircuitFailures >= MM_CIRCUIT_THRESHOLD) {
			mmCircuitOpenUntil = Date.now() + MM_CIRCUIT_RESET_MS;
			logger.warn("Message-manager circuit breaker opened", {
				failures: mmCircuitFailures,
				resetMs: MM_CIRCUIT_RESET_MS,
			});
		}
	}
}

async function _deliverMessage(
	entry: { id: string; message: unknown },
	ctx: Pick<BatchReplayContext, "messageManagerUrl" | "client">
): Promise<void> {
	if (shuttingDown) {
		throw new Error("Server shutting down");
	}
	await ctx.client.post(`${ctx.messageManagerUrl}/message`, entry.message, {
		timeoutMs: 10_000,
		serviceName: ServiceInstanceName.MessageDeliveryService,
		retryCount: 3,
	});
}

async function _handleDeliveryMarkFailed(
	entryId: string,
	ctx: Pick<BatchReplayContext, "instanceId" | "batchId">,
	httpError: string
): Promise<void> {
	try {
		await dlqRetryManager.markRetried(
			entryId,
			ctx.instanceId,
			ctx.batchId,
			false,
			httpError
		);
	} catch (markErr) {
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
}

async function replaySingleEntry(
	entry: { id: string; message: unknown },
	ctx: BatchReplayContext,
	batchTimedOut: () => boolean,
	activeReplays: ActiveReplayCounter
): Promise<void> {
	activeReplays.increment();
	try {
		await _deliverMessage(entry, ctx);
		await dlqRetryManager.markRetried(entry.id, ctx.instanceId, ctx.batchId, true);
	} catch (err) {
		if (batchTimedOut()) {
			throw err;
		}
		const httpError = (err as Error).message;
		await _handleDeliveryMarkFailed(entry.id, ctx, httpError);
		throw err;
	} finally {
		activeReplays.decrement();
	}
}

async function runBatchLoop(
	options: BatchLoopOptions
): Promise<void> {
	const { entries, ctx, concurrency, isTimedOut, batchResults } = options;
	for (let i = 0; i < entries.length && !isTimedOut(); i += concurrency) {
		const batch = entries.slice(i, i + concurrency);
		const results = await Promise.allSettled(
			batch.map((entry) =>
				replaySingleEntry(entry, ctx, isTimedOut, activeReplays)
			)
		);
		processBatchResults({ batch, batchResults: results, ctx, results: batchResults });
	}
}

function processBatchResults(
	options: ProcessBatchResultsOptions
): void {
	const { batch, batchResults, ctx, results } = options;
	for (let idx = 0; idx < batchResults.length; idx++) {
		const result = batchResults[idx];
		const entry = batch[idx];
		if (result.status === "fulfilled") {
			results.successCount.value++;
		} else {
			results.errors.push({
				id: entry?.id ?? "unknown",
				error: (result.reason as Error)?.message ?? "unknown error",
			});
			logger.error("DLQ replay entry failed", {
				entryId: entry?.id,
				error: (result.reason as Error)?.message,
				batchId: ctx.batchId,
			});
		}
	}
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
	entries: Array<{ id: string; message: unknown }>,
	error: string
): { success: number; errors: Array<{ id: string; error: string }> } {
	return {
		success: 0,
		errors: entries.map((entry) => ({ id: entry.id, error })),
	};
}

async function _runBatchWithTimeout(
	entries: Array<{ id: string; message: unknown }>,
	ctx: BatchReplayContext
): Promise<{ success: number; errors: Array<{ id: string; error: string }> }> {
	const ReplayConcurrency = 10;
	const ReplayBatchTimeoutMs = 120_000;
	let batchTimedOut = false;
	const batchResults: BatchResults = {
		successCount: { value: 0 },
		errors: [],
	};

	const batchLoop = runBatchLoop({
		entries,
		ctx,
		concurrency: ReplayConcurrency,
		isTimedOut: () => batchTimedOut,
		batchResults,
	});

	const timeoutPromise = waitForBatchTimeout(
		ctx.batchId,
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
			/* errors handled internally */
		}
	}

	return { success: batchResults.successCount.value, errors: batchResults.errors };
}

async function doReplayBatch(
	options: ReplayBatchOptions
): Promise<{ success: number; errors: Array<{ id: string; error: string }> }> {
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
			{
				batchId,
				entryCount: entries.length,
			}
		);
		return _rejectAll(entries, "Message-manager circuit breaker open");
	}

	activeBatches++;
	try {
		const client = await getHttpClient();
		const ctx: BatchReplayContext = { client, messageManagerUrl, batchId, instanceId };
		const { success, errors } = await _runBatchWithTimeout(
			entries,
			ctx
		);

		recordMMResult(success > 0);
		return { success, errors };
	} finally {
		activeBatches--;
	}
}

function notifyAddAudit(
	id: string,
	topic: string | undefined,
	reason: string | undefined
): void {
	void notifyAudit({
		timestamp: new Date().toISOString(),
		topic: topic ?? "unknown",
		publisher: "dlq-service",
		correlationId: id,
		summary: `DLQ entry added: ${reason ?? "no reason"}`,
		severity: "WARNING",
	});
}

function notifyReplayAudit(
	options: ReplayAuditInfo
): void {
	const { batchId, topic, success, failed } = options;
	if (success === 0 && failed === 0) {
		return;
	}
	void notifyAudit({
		timestamp: new Date().toISOString(),
		topic: topic ?? "unknown",
		publisher: "dlq-service",
		correlationId: batchId,
		summary: `DLQ replay: ${success} succeeded, ${failed} failed`,
		severity: failed > 0 ? "ERROR" : "INFO",
	});
}

function notifyAbandonAudit(count: number): void {
	if (count === 0) {
		return;
	}
	void notifyAudit({
		timestamp: new Date().toISOString(),
		topic: "dlq-service",
		publisher: "dlq-service",
		correlationId: "abandon",
		summary: `${count} DLQ entries abandoned after max retries`,
		severity: "CRITICAL",
	});
}

async function handleAbandonedEntries(source: string): Promise<void> {
	const abandoned = await dlqRetryManager.abandonExhaustedEntries();
	if (abandoned > 0) {
		logger.warn(`${source}: ${abandoned} entries abandoned after max retries`);
		notifyAbandonAudit(abandoned);
	}
}

function notifyDeleteAudit(ids: string[], deleted: number): void {
	if (deleted === 0) {
		return;
	}
	void notifyAudit({
		timestamp: new Date().toISOString(),
		topic: "dlq-service",
		publisher: "dlq-service",
		correlationId: ids[0],
		summary: `${deleted} DLQ entries deleted`,
		severity: "INFO",
	});
}

function _validationFail(
	span: import("@opentelemetry/api").Span,
	message: string,
	httpCode: number,
	extra?: Record<string, string>
): { valid: false; response: ResponseObject } {
	span.setStatus({ code: SpanStatusCode.ERROR, message });
	span.end();
	return {
		valid: false,
		response: sendResponse({ error: message, ...extra }, httpCode),
	};
}

function validateAddEntryBody(
	body: unknown,
	span: import("@opentelemetry/api").Span
):
	| { valid: false; response: ResponseObject }
	| { valid: true; data: z.infer<typeof DlqEntrySchema> } {
	const parsed = DlqEntrySchema.safeParse(body);
	if (!parsed.success) {
		return _validationFail(span, parsed.error.message, 400);
	}

	span.setAttribute("topic", parsed.data.topic ?? "");
	span.setAttribute("reason", parsed.data.reason ?? "");

	const messageStr = JSON.stringify(parsed.data.message);
	const msgSize = Buffer.byteLength(messageStr, "utf8");
	if (msgSize > MAX_MESSAGE_BYTES) {
		return _validationFail(
			span,
			"Message payload exceeds maximum size of 5MB",
			400
		);
	}

	if (!isDbConnected()) {
		return _validationFail(
			span,
			"Storage unavailable — message not persisted. Retry later.",
			503,
			{ code: "STORAGE_UNAVAILABLE" }
		);
	}

	return { valid: true, data: parsed.data };
}

async function pushToRedisQueue(id: string): Promise<void> {
	try {
		await Promise.race([
			dlqRedisQueue.push(id),
			new Promise<void>((_, reject) => {
				const timer = setTimeout(
					() => reject(new Error("Redis push timeout")),
					2000
				);
				timer.unref();
			}),
		]);
	} catch (err) {
		logger.warn("Failed to push entry to Redis queue", {
			entryId: id,
			error: (err as Error)?.message,
		});
	}
}

function handleAddEntryError(
	err: unknown,
	span: import("@opentelemetry/api").Span
): ResponseObject {
	if (err instanceof DlqCapacityError) {
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: "DLQ capacity limit reached",
		});
		span.end();
		return sendResponse(
			{ error: "DLQ capacity limit reached, entry rejected" },
			429
		);
	}
	logger.error("Failed to persist DLQ entry — storage error", {
		error: normalizeError(err).message,
	});
	span.recordException(err as Error);
	span.setStatus({
		code: SpanStatusCode.ERROR,
		message: (err as Error).message,
	});
	span.end();
	return sendResponse(
		{
			error: "Storage unavailable — message not persisted. Retry later.",
			code: "STORAGE_UNAVAILABLE",
		},
		503
	);
}

export const AddEntry = catchSync((req) => {
	return tracer.startActiveSpan("dlq-add-entry", async (span) => {
		try {
			const validation = validateAddEntryBody(req.body, span);
			if (!validation.valid) {
				return validation.response;
			}

			const id = await dlqRepository.add(validation.data);
			span.setAttribute("entryId", id);
			metrics.entriesAdded.inc(1);
			await pushToRedisQueue(id);
			notifyAddAudit(id, validation.data.topic, validation.data.reason);
			span.setStatus({ code: SpanStatusCode.OK });
			span.end();
			return sendResponse({ id }, 201);
		} catch (err) {
			return handleAddEntryError(err, span);
		}
	});
});

export const ListEntries = catchSync(async (req) => {
	const topic = req.query.topic as string | undefined;
	const cursor = req.query.cursor as string | undefined;
	const limit = Math.min(
		Number.parseInt(req.query.limit as string, 10) || 100,
		1000
	);
	const offset = cursor
		? 0
		: Math.max(Number.parseInt(req.query.offset as string, 10) || 0, 0);

	const entries = await dlqRepository.list(topic, limit, offset, cursor);
	const hasMore = entries.length === limit;
	const response: Record<string, unknown> = {
		entries,
		count: entries.length,
		hasMore,
	};
	if (!cursor) {
		response.offset = offset;
	}
	if (hasMore && entries.length > 0) {
		response.cursor = entries[entries.length - 1].id;
	}
	return sendResponse(response, 200);
});

export const DeleteEntries = catchSync(async (req) => {
	const parsed = DeleteSchema.safeParse(req.body);
	if (!parsed.success) {
		return sendResponse({ error: parsed.error.message }, 400);
	}

	const deleted = await dlqRepository.delete(parsed.data.ids);
	metrics.entriesDeleted.inc(deleted);
	notifyDeleteAudit(parsed.data.ids, deleted);
	return sendResponse({ deleted }, 200);
});

export const HealthCheck = catchSync(async (_req) => {
	const count = await dlqRepository.count();
	return sendResponse({ status: "ok", entries: count }, 200);
});

export const ReadyCheck = catchSync(async (_req) => {
	const dbOk = isDbConnected();
	if (!dbOk) {
		return sendResponse(
			{ status: "not ready", reason: "Database not connected" },
			503
		);
	}
	const missingIndexes = getMissingCriticalIndexes();
	if (missingIndexes.length > 0) {
		return sendResponse(
			{
				status: "degraded",
				reason: `Missing critical indexes: ${missingIndexes.join(", ")}`,
			},
			503
		);
	}
	const redisOk = dlqRedisQueue.isAvailable();
	const status = redisOk ? "ready" : "degraded";
	const count = await dlqRepository.count();
	return sendResponse(
		{ status, entries: count, redis: redisOk ? "connected" : "unavailable" },
		200
	);
});

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

async function abandonExhaustedIfNeeded(
	errors: Array<{ id: string; error: string }>
): Promise<void> {
	if (errors.length === 0) {
		return;
	}
	const abandoned = await dlqRetryManager.abandonExhaustedEntries();
	if (abandoned > 0) {
		logger.warn(
			`DLQ manual replay: ${abandoned} entries abandoned after max retries`
		);
		void notifyAbandonAudit(abandoned);
	}
}

function buildReplayResponse(
	batchId: string,
	successCount: number,
	errors: Array<{ id: string; error: string }>
): Record<string, unknown> {
	const details: Record<string, unknown> = {
		batchId,
		replayed: successCount,
		failed: errors.length,
	};
	if (errors.length > 0) {
		details.errors = errors;
	}
	if (successCount > 0) {
		metrics.entriesReplayed.inc(successCount);
	}
	if (errors.length > 0) {
		metrics.entriesReplayFailed.inc(errors.length);
	}
	return details;
}

async function _claimAndReplayBatch(
	options: ClaimAndReplayOptions
): Promise<{
	response: ResponseObject | null;
	successCount: number;
	errors: Array<{ id: string; error: string }>;
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
		entries: entries.map((entry) => ({ id: entry.id, message: entry.message })),
		messageManagerUrl,
		batchId,
		instanceId: env.INSTANCE_ID,
	});

	await abandonExhaustedIfNeeded(errors);

	span.setAttribute("replayed", successCount);
	span.setAttribute("failed", errors.length);

	return { response: null, successCount, errors };
}

async function _executeReplayPipeline(
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

	const { response: earlyResponse, successCount, errors } = await _claimAndReplayBatch({
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
	void notifyReplayAudit({
		batchId,
		topic: validation.data.topic,
		success: successCount,
		failed: errors.length,
	});

	return sendResponse(details, 200);
}

export const ReplayEntries = catchSync((req) => {
	return tracer.startActiveSpan("dlq-replay-entries", async (span) => {
		try {
			return await _executeReplayPipeline(req.query, span);
		} catch (err) {
			span.recordException(err as Error);
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: (err as Error).message,
			});
			throw err;
		} finally {
			span.end();
		}
	});
});

export async function pruneOldEntries(): Promise<number> {
	try {
		const pruned = await dlqRepository.prune(env.MAX_ENTRIES);
		if (pruned > 0) {
			metrics.entriesPruned.inc(pruned);
			logger.info(`Pruned ${pruned} old DLQ entries`);
		}
		return pruned;
	} catch (err) {
		logger.error("DLQ periodic prune failed", {
			error: (err as Error)?.message,
		});
		metrics.pruneErrors.inc(1);
		return 0;
	}
}

export function startPeriodicPrune(): void {
	if (pruneTimer) {
		return;
	}
	logger.info("Starting periodic DLQ prune", {
		intervalMs: env.DLQ_PRUNE_INTERVAL_MS,
	});
	pruneTimer = setInterval(() => {
		pruneOldEntries().catch((err) => {
			logger.warn("Periodic prune iteration failed", {
				error: (err as Error)?.message,
			});
		});
	}, env.DLQ_PRUNE_INTERVAL_MS);
	pruneTimer.unref();
}

export function stopPeriodicPrune(): void {
	if (pruneTimer) {
		clearInterval(pruneTimer);
		pruneTimer = null;
	}
}

async function resolveMMUrlOrSkip(): Promise<string | null> {
	const messageManagerUrl = await resolveMessageManagerUrl();
	if (!messageManagerUrl) {
		logger.warn(
			"DLQ auto-retry: cannot resolve message-manager URL, skipping cycle"
		);
		return null;
	}
	return messageManagerUrl;
}

async function executeAutoRetryReplay(
	entries: Array<{ id: string; message: unknown }>,
	messageManagerUrl: string,
	batchId: string
): Promise<{ success: number; errors: Array<{ id: string; error: string }> }> {
	logger.info(`DLQ auto-retry: replaying ${entries.length} entries`);
	const result = await doReplayBatch({
		entries,
		messageManagerUrl,
		batchId,
		instanceId: env.INSTANCE_ID,
	});
	if (result.success > 0) {
		metrics.entriesReplayed.inc(result.success);
	}
	if (result.errors.length > 0) {
		metrics.entriesReplayFailed.inc(result.errors.length);
	}
	return result;
}

async function _executeAutoRetryCycle(
	messageManagerUrl: string
): Promise<void> {
	await dlqClaimManager.releaseStaleClaims();

	const batchId = `auto-retry-${Date.now()}-${randomUUID().slice(0, 8)}`;
	const entries = await dlqClaimManager.claimEntriesForRetry({
		limit: env.DLQ_AUTO_RETRY_LIMIT,
		batchId,
		instanceId: env.INSTANCE_ID,
	});
	if (entries.length === 0) {
		await handleAbandonedEntries("DLQ auto-retry");
		return;
	}

	const { success, errors } = await executeAutoRetryReplay(
		entries.map((entry) => ({ id: entry.id, message: entry.message })),
		messageManagerUrl,
		batchId
	);

	void notifyReplayAudit({ batchId, topic: undefined, success, failed: errors.length });

	if (errors.length > 0) {
		await handleAbandonedEntries("DLQ auto-retry");
	}

	logger.info(`DLQ auto-retry: ${success} replayed, ${errors.length} failed`);
}

export async function autoRetryTick(): Promise<void> {
	if (!env.DLQ_AUTO_RETRY_ENABLED || shuttingDown) {
		return;
	}

	const messageManagerUrl = await resolveMMUrlOrSkip();
	if (!messageManagerUrl || shuttingDown) {
		return;
	}

	await _executeAutoRetryCycle(messageManagerUrl);
}

async function runAutoRetryTick(): Promise<void> {
	try {
		await autoRetryTick();
	} catch (err) {
		logger.error("DLQ auto-retry tick failed", {
			error: (err as Error)?.message,
		});
	}
	if (!shuttingDown) {
		scheduleAutoRetryTick();
	}
}

async function _popRedisQueueEntries(): Promise<string[]> {
	const entryIds: string[] = [];
	for (let i = 0; i < env.DLQ_AUTO_RETRY_LIMIT; i++) {
		const entryId = await dlqRedisQueue.pop();
		if (!entryId) {
			break;
		}
		entryIds.push(entryId);
	}
	return entryIds;
}

async function claimBatchEntries(
	entryIds: string[],
	batchId: string
): Promise<Array<{ id: string; message: unknown }> | null> {
	const validIds = entryIds.filter((id) => ObjectId.isValid(id));
	if (validIds.length === 0) {
		return null;
	}

	const claimed = await dlqClaimManager.claimEntriesByIds(
		validIds,
		batchId,
		env.INSTANCE_ID
	);
	if (claimed.length === 0) {
		return null;
	}

	if (shuttingDown) {
		for (const remaining of entryIds) {
			void dlqRedisQueue.push(remaining);
		}
		return null;
	}

	return claimed.map((entry) => ({ id: entry.id, message: entry.message }));
}

async function executeClaimReplay(
	entries: Array<{ id: string; message: unknown }>,
	messageManagerUrl: string,
	batchId: string
): Promise<void> {
	logger.info(`DLQ Redis queue: replaying ${entries.length} entries`);
	const { success, errors } = await doReplayBatch({
		entries,
		messageManagerUrl,
		batchId,
		instanceId: env.INSTANCE_ID,
	});

	if (success > 0) {
		metrics.entriesReplayed.inc(success);
	}
	if (errors.length > 0) {
		metrics.entriesReplayFailed.inc(errors.length);
	}

	if (errors.length > 0) {
		await handleAbandonedEntries("DLQ Redis queue");
	}

	logger.info(`DLQ Redis queue: ${success} replayed, ${errors.length} failed`);
}

async function _claimAndReplayEntries(
	entryIds: string[],
	messageManagerUrl: string
): Promise<void> {
	const batchId = `redis-${Date.now()}-${randomUUID().slice(0, 8)}`;
	const entries = await claimBatchEntries(entryIds, batchId);
	if (!entries || entries.length === 0) {
		return;
	}
	await executeClaimReplay(entries, messageManagerUrl, batchId);
}

async function processRedisQueue(): Promise<void> {
	if (shuttingDown) {
		return;
	}
	if (!dlqRedisQueue.isAvailable()) {
		return;
	}

	const messageManagerUrl = await resolveMessageManagerUrl();
	if (!messageManagerUrl) {
		return;
	}

	await dlqClaimManager.releaseStaleClaims();

	const entryIds = await _popRedisQueueEntries();

	if (entryIds.length === 0) {
		return;
	}

	await _claimAndReplayEntries(entryIds, messageManagerUrl);
}

function scheduleAutoRetryTick(): void {
	const baseInterval = env.DLQ_AUTO_RETRY_INTERVAL_MS;
	const jitter =
		Math.floor(Math.random() * baseInterval * 0.2) -
		Math.floor(baseInterval * 0.1);
	autoRetryTimer = setTimeout(() => {
		void runAutoRetryTick();
	}, baseInterval + jitter);
	autoRetryTimer.unref();
}

export async function rebuildQueueFromMongo(): Promise<void> {
	try {
		const entries = await dlqRepository.listQueuable();
		for (const entryId of entries) {
			void dlqRedisQueue.push(entryId);
		}
		logger.info("Redis queue rebuilt from MongoDB", {
			pushedCount: entries.length,
		});
	} catch (err) {
		logger.warn("Failed to rebuild Redis queue from MongoDB", {
			error: (err as Error)?.message,
		});
	}
}

export function startAutoRetry(): void {
	if (!env.DLQ_AUTO_RETRY_ENABLED) {
		return;
	}
	if (autoRetryTimer) {
		return;
	}
	logger.info("Starting DLQ auto-retry scheduler", {
		intervalMs: env.DLQ_AUTO_RETRY_INTERVAL_MS,
	});
	const jitterMs = Math.floor(Math.random() * env.DLQ_AUTO_RETRY_INTERVAL_MS);
	autoRetryStartTimer = setTimeout(() => {
		autoRetryStartTimer = null;
		scheduleAutoRetryTick();
	}, jitterMs);
	autoRetryStartTimer.unref();

	const RedisWorkerIntervalMs = 1000;
	async function redisWorkerLoop(): Promise<void> {
		if (shuttingDown) {
			return;
		}
		try {
			await processRedisQueue();
		} catch (err) {
			logger.error("DLQ Redis queue worker error", {
				error: (err as Error)?.message,
			});
		}
		if (!shuttingDown) {
			redisRetryTimer = setTimeout(redisWorkerLoop, RedisWorkerIntervalMs);
			redisRetryTimer.unref();
		}
	}
	void redisWorkerLoop();
}

export function stopAutoRetry(): void {
	if (autoRetryStartTimer) {
		clearTimeout(autoRetryStartTimer);
		autoRetryStartTimer = null;
	}
	if (autoRetryTimer) {
		clearTimeout(autoRetryTimer);
		autoRetryTimer = null;
	}
	if (redisRetryTimer) {
		clearTimeout(redisRetryTimer);
		redisRetryTimer = null;
	}
}

export async function releaseStaleClaims(
	staleThresholdMs?: number
): Promise<void> {
	const released = await dlqClaimManager.releaseStaleClaims(staleThresholdMs);
	if (released > 0) {
		logger.info(`Released ${released} stale claims from previous instance`);
	}
}

async function drainActiveReplays(): Promise<void> {
	if (activeReplays.count === 0) {
		return;
	}

	logger.info(
		`Waiting for ${activeReplays.count} in-flight replays to complete`
	);
	const drainTimeout = 10_000;
	const deadline = Date.now() + drainTimeout;
	while (activeReplays.count > 0 && Date.now() < deadline) {
		await new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, 100);
			timer.unref();
		});
	}

	if (activeReplays.count === 0) {
		return;
	}

	logger.warn(
		`${activeReplays.count} replays did not complete within drain timeout — releasing their claims`
	);
	await dlqClaimManager.releaseAllActiveClaims();
	await new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, 500);
		timer.unref();
	});
	await dlqClaimManager.releaseAllActiveClaims();
}

async function releaseAndRequeueClaims(): Promise<void> {
	const releasedCount = await dlqClaimManager.releaseClaimsByInstance(
		env.INSTANCE_ID
	);
	if (releasedCount > 0 && dlqRedisQueue.isAvailable()) {
		const allQueuable = await dlqRepository.listQueuable();
		const uniqueIds = [...new Set(allQueuable)];
		const toPush = uniqueIds.slice(
			0,
			Math.min(releasedCount, uniqueIds.length)
		);
		for (const id of toPush) {
			dlqRedisQueue.push(id).catch(() => {});
		}
		logger.info(`Re-queued up to ${toPush.length} entries after shutdown`);
	}
}

export async function shutdownSchedulers(): Promise<void> {
	shuttingDown = true;
	stopPeriodicPrune();
	stopAutoRetry();
	await drainActiveReplays();
	await releaseAndRequeueClaims();
	await dlqRedisQueue.close();
	await closeHttpClient();
}
