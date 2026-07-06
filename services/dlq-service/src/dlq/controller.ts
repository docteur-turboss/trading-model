import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import { getMissingCriticalIndexes, isDbConnected } from "../config/db";
import { metrics } from "../config/metrics";
import { dlqRedisQueue } from "../config/redis-queue";
import { notifyAddAudit, notifyDeleteAudit } from "./audit-notifier";
import {
	autoRetryTick,
	rebuildQueueFromMongo,
	startAutoRetry,
	stopAutoRetry,
} from "./auto-retry";
import {
	DeleteSchema,
	handleAddEntryError,
	pushToRedisQueue,
	validateAddEntryBody,
} from "./entry-validation";
import { executeReplayPipeline } from "./replay-pipeline";
import { dlqRepository } from "./repository";
import { reloadHttpClientTls } from "./shared/index";
import {
	pruneOldEntries,
	releaseStaleClaims,
	shutdownSchedulers,
	startPeriodicPrune,
	stopPeriodicPrune,
} from "./shutdown-manager";

export {
	autoRetryTick,
	pruneOldEntries,
	rebuildQueueFromMongo,
	releaseStaleClaims,
	reloadHttpClientTls,
	shutdownSchedulers,
	startAutoRetry,
	startPeriodicPrune,
	stopAutoRetry,
	stopPeriodicPrune,
};

const tracer = trace.getTracer("dlq-service");

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

	const entries = await dlqRepository.list({
		topic,
		limit,
		offset,
		before: cursor,
	});
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
