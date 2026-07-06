import { SpanStatusCode, trace } from "@opentelemetry/api";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import { normalizeError } from "@trading-model/common/utils/errors";
import { z } from "zod";
import { getMissingCriticalIndexes, isDbConnected } from "../config/db";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { metrics } from "../config/metrics";
import { dlqRedisQueue } from "../config/redis-queue";
import { notifyAddAudit, notifyDeleteAudit } from "./audit-notifier";
import {
	autoRetryTick,
	rebuildQueueFromMongo,
	startAutoRetry,
	stopAutoRetry,
} from "./auto-retry";
import { dlqClaimManager } from "./claim-manager";
import { executeReplayPipeline } from "./replay-pipeline";
import { DlqCapacityError, dlqRepository } from "./repository";
import {
	activeReplays,
	closeHttpClient,
	reloadHttpClientTls,
	setShuttingDown,
} from "./shared/index";

export {
	autoRetryTick,
	rebuildQueueFromMongo,
	reloadHttpClientTls,
	startAutoRetry,
	stopAutoRetry,
};

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

let pruneTimer: ReturnType<typeof setInterval> | null = null;

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
		await Promise.race([dlqRedisQueue.push(id), _redisPushTimeout()]);
	} catch (err) {
		_logRedisPushError(id, err);
	}
}

function _redisPushTimeout(): Promise<void> {
	return new Promise<void>((_, reject) => {
		const timer = setTimeout(
			() => reject(new Error("Redis push timeout")),
			2000
		);
		timer.unref();
	});
}

function _logRedisPushError(entryId: string, err: unknown): void {
	logger.warn("Failed to push entry to Redis queue", {
		entryId,
		error: (err as Error)?.message,
	});
}

function handleAddEntryError(
	err: unknown,
	span: import("@opentelemetry/api").Span
): ResponseObject {
	if (err instanceof DlqCapacityError) {
		return _handleCapacityError(span);
	}
	return _handleStorageError(err, span);
}

function _handleCapacityError(
	span: import("@opentelemetry/api").Span
): ResponseObject {
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

function _handleStorageError(
	err: unknown,
	span: import("@opentelemetry/api").Span
): ResponseObject {
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
	const limit: PaginationQuery["limit"] = Math.min(
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

export const ReplayEntries = catchSync((req) => {
	return tracer.startActiveSpan("dlq-replay-entries", async (span) => {
		try {
			return await executeReplayPipeline(req.query, span);
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
		return _handlePruneError(err);
	}
}

function _handlePruneError(err: unknown): number {
	logger.error("DLQ periodic prune failed", {
		error: (err as Error)?.message,
	});
	metrics.pruneErrors.inc(1);
	return 0;
}

export function startPeriodicPrune(): void {
	if (pruneTimer) {
		return;
	}
	_logPruneStart();
	pruneTimer = setInterval(() => {
		pruneOldEntries().catch((err) => {
			_logPruneIterationError(err);
		});
	}, env.DLQ_PRUNE_INTERVAL_MS);
	pruneTimer.unref();
}

function _logPruneStart(): void {
	logger.info("Starting periodic DLQ prune", {
		intervalMs: env.DLQ_PRUNE_INTERVAL_MS,
	});
}

function _logPruneIterationError(err: unknown): void {
	logger.warn("Periodic prune iteration failed", {
		error: (err as Error)?.message,
	});
}

export function stopPeriodicPrune(): void {
	if (pruneTimer) {
		clearInterval(pruneTimer);
		pruneTimer = null;
	}
}

async function drainActiveReplays(): Promise<void> {
	if (activeReplays.count === 0) {
		return;
	}

	logger.info(
		`Waiting for ${activeReplays.count} in-flight replays to complete`
	);
	await _waitForReplays();

	if (activeReplays.count === 0) {
		return;
	}

	await _forceReleaseClaims();
}

async function _waitForReplays(): Promise<void> {
	const drainTimeout = 10_000;
	const deadline = Date.now() + drainTimeout;
	while (activeReplays.count > 0 && Date.now() < deadline) {
		await _sleep(100);
	}
}

async function _forceReleaseClaims(): Promise<void> {
	logger.warn(
		`${activeReplays.count} replays did not complete within drain timeout — releasing their claims`
	);
	await dlqClaimManager.releaseAllActiveClaims();
	await _sleep(500);
	await dlqClaimManager.releaseAllActiveClaims();
}

function _sleep(ms: number): Promise<void> {
	return new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		timer.unref();
	});
}

async function releaseAndRequeueClaims(): Promise<void> {
	const releasedCount = await dlqClaimManager.releaseClaimsByInstance(
		env.INSTANCE_ID
	);
	if (releasedCount > 0 && dlqRedisQueue.isAvailable()) {
		const toPush = await _computeRequeueBatch(releasedCount);
		for (const id of toPush) {
			dlqRedisQueue.push(id).catch(() => {});
		}
		logger.info(`Re-queued up to ${toPush.length} entries after shutdown`);
	}
}

async function _computeRequeueBatch(releasedCount: number): Promise<string[]> {
	const allQueuable = await dlqRepository.listQueuable();
	const uniqueIds = [...new Set(allQueuable)];
	return uniqueIds.slice(0, Math.min(releasedCount, uniqueIds.length));
}

export async function releaseStaleClaims(
	staleThresholdMs?: number
): Promise<void> {
	const released = await dlqClaimManager.releaseStaleClaims(staleThresholdMs);
	if (released > 0) {
		logger.info(`Released ${released} stale claims from previous instance`);
	}
}

export async function shutdownSchedulers(): Promise<void> {
	setShuttingDown(true);
	stopPeriodicPrune();
	stopAutoRetry();
	await drainActiveReplays();
	await releaseAndRequeueClaims();
	await dlqRedisQueue.close();
	await closeHttpClient();
}
