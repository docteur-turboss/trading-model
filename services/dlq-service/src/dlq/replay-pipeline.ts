import { randomUUID } from "node:crypto";

import { SpanStatusCode } from "@opentelemetry/api";
import type { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { z } from "zod";
import { findAService } from "../config/address-manager";
import { notifyAudit } from "../config/audit";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { metrics } from "../config/metrics";
import { dlqClaimManager } from "./claim-manager";
import { dlqRetryManager } from "./retry-manager";

interface ReplayContext {
	client: HttpClient;
	messageManagerUrl: string;
	batchId: string;
	instanceId: string;
	isTimedOut: () => boolean;
	successCount: { value: number };
	errors: Array<{ id: string; error: string }>;
}

const ReplaySchema = z.object({
	topic: z.string().optional(),
	limit: z.coerce.number().int().positive().max(100).default(50),
	batchId: z.string().optional(),
});

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

let shuttingDown = false;

export function setShuttingDown(value: boolean): void {
	shuttingDown = value;
}

export function isShuttingDown(): boolean {
	return shuttingDown;
}

let httpClient: HttpClient | null = null;
let httpClientPromise: Promise<HttpClient> | null = null;

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

async function _deliverMessage(
	entry: { id: string; message: unknown },
	messageManagerUrl: string,
	client: HttpClient
): Promise<void> {
	if (shuttingDown) {
		throw new Error("Server shutting down");
	}
	await client.post(`${messageManagerUrl}/message`, entry.message, {
		timeoutMs: 10_000,
		serviceName: ServiceInstanceName.MessageDeliveryService,
		retryCount: 3,
	});
}

async function _handleDeliveryMarkFailed(
	entryId: string,
	instanceId: string,
	batchId: string,
	httpError: string
): Promise<void> {
	try {
		await dlqRetryManager.markRetried(
			entryId,
			instanceId,
			batchId,
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
	ctx: ReplayContext
): Promise<void> {
	activeReplays.increment();
	try {
		await _deliverMessage(entry, ctx.messageManagerUrl, ctx.client);
		await dlqRetryManager.markRetried(entry.id, ctx.instanceId, ctx.batchId, true);
	} catch (err) {
		if (ctx.isTimedOut()) {
			throw err;
		}
		const httpError = (err as Error).message;
		await _handleDeliveryMarkFailed(entry.id, ctx.instanceId, ctx.batchId, httpError);
		throw err;
	} finally {
		activeReplays.decrement();
	}
}

async function runBatchLoop(
	entries: Array<{ id: string; message: unknown }>,
	ctx: ReplayContext,
	concurrency: number
): Promise<void> {
	for (let i = 0; i < entries.length && !ctx.isTimedOut(); i += concurrency) {
		const batch = entries.slice(i, i + concurrency);
		const batchResults = await Promise.allSettled(
			batch.map((entry) => replaySingleEntry(entry, ctx))
		);
		processBatchResults(batch, batchResults, ctx);
	}
}

function processBatchResults(
	batch: Array<{ id: string; message: unknown }>,
	batchResults: PromiseSettledResult<void>[],
	ctx: Pick<ReplayContext, "batchId" | "successCount" | "errors">
): void {
	for (let idx = 0; idx < batchResults.length; idx++) {
		const result = batchResults[idx];
		const entry = batch[idx];
		if (result.status === "fulfilled") {
			ctx.successCount.value++;
		} else {
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
	ctxBase: {
		client: HttpClient;
		messageManagerUrl: string;
		batchId: string;
		instanceId: string;
	}
): Promise<{ success: number; errors: Array<{ id: string; error: string }> }> {
	const ReplayConcurrency = 10;
	const ReplayBatchTimeoutMs = 120_000;
	let batchTimedOut = false;
	const successCount = { value: 0 };
	const errors: Array<{ id: string; error: string }> = [];
	const ctx: ReplayContext = {
		...ctxBase,
		isTimedOut: () => batchTimedOut,
		successCount,
		errors,
	};

	const batchLoop = runBatchLoop(entries, ctx, ReplayConcurrency);

	const timeoutPromise = waitForBatchTimeout(
		batchId,
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
	entries: Array<{ id: string; message: unknown }>,
	messageManagerUrl: string,
	batchId: string,
	instanceId: string
): Promise<{ success: number; errors: Array<{ id: string; error: string }> }> {
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
	messageManagerUrl: string,
	limit: number,
	batchId: string,
	topic: string | undefined,
	span: import("@opentelemetry/api").Span
): Promise<{
	response: ResponseObject | null;
	successCount: number;
	errors: Array<{ id: string; error: string }>;
}> {
	await dlqClaimManager.releaseStaleClaims();
	const entries = await dlqClaimManager.claimEntriesForRetry(
		limit,
		batchId,
		env.INSTANCE_ID,
		topic
	);

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

	const { success: successCount, errors } = await doReplayBatch(
		entries.map((entry) => ({ id: entry.id, message: entry.message })),
		messageManagerUrl,
		batchId,
		env.INSTANCE_ID
	);

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
	} = await _claimAndReplayBatch(
		messageManagerUrl,
		validation.data.limit,
		batchId,
		validation.data.topic,
		span
	);
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
