import { SpanStatusCode, trace } from "@opentelemetry/api";

import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";

import { getMissingCriticalIndexes, isDbConnected } from "../config/db";
import { metrics } from "../config/metrics";
import { dlqRedisQueue } from "../config/redis-queue";
import { notifyDeleteAudit } from "./audit-notifier";
import { DeleteSchema } from "./dlq-schemas";
import { executeReplayPipeline } from "./replay-pipeline";
import { dlqRepository } from "./repository";

export { addEntry } from "./add-entry-pipeline";

const tracer = trace.getTracer("dlq-service");

function _buildPaginationQuery(query: Record<string, unknown>): {
	topic: string | undefined;
	limit: PaginationQuery["limit"];
	offset: number;
	cursor: string | undefined;
} {
	const cursor = query.cursor as string | undefined;
	const topic = query.topic as string | undefined;
	const limit = Math.min(
		Number.parseInt(String(query.limit ?? "10"), 10) || 100,
		1000
	);
	const offset = cursor
		? 0
		: Math.max(
				Number.parseInt((query.offset as string) ?? "0", 10) || 0,
				0
			);
	return { topic, limit, offset, cursor };
}

export async function listEntries(req: {
	query: Record<string, unknown>;
}): Promise<ResponseObject> {
	const { topic, limit, offset, cursor } = _buildPaginationQuery(req.query);

	const entries = await dlqRepository.query({
		topic,
		limit,
		offset,
		before: cursor,
	});
	return sendResponse(_buildListResponse(entries, limit, offset, cursor), 200);
}

function _buildListResponse(
	entries: import("./repository").StoredDlqEntry[],
	limit: number,
	offset: number | undefined,
	cursor: string | undefined
): Record<string, unknown> {
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
	return response;
}

export async function deleteEntries(req: {
	body: unknown;
}): Promise<ResponseObject> {
	const parsed = DeleteSchema.safeParse(req.body);
	if (!parsed.success) {
		return sendResponse({ error: parsed.error.message }, 400);
	}

	const deleted = await dlqRepository.delete(parsed.data.ids);
	metrics.entriesDeleted.inc(deleted);
	notifyDeleteAudit(parsed.data.ids, deleted);
	return sendResponse({ deleted }, 200);
}

export async function healthCheck(): Promise<ResponseObject> {
	const count = await dlqRepository.count();
	return sendResponse({ status: "ok", entries: count }, 200);
}

export async function readyCheck(): Promise<ResponseObject> {
	const dbResponse = _checkDbReady();
	if (dbResponse) return dbResponse;

	const indexResponse = _checkIndexesReady();
	if (indexResponse) return indexResponse;

	return _buildReadyResponse();
}

function _checkDbReady(): ResponseObject | null {
	if (!isDbConnected()) {
		return sendResponse(
			{ status: "not ready", reason: "Database not connected" },
			503
		);
	}
	return null;
}

function _checkIndexesReady(): ResponseObject | null {
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
	return null;
}

async function _buildReadyResponse(): Promise<ResponseObject> {
	const redisOk = dlqRedisQueue.isAvailable();
	const status = redisOk ? "ready" : "degraded";
	const count = await dlqRepository.count();
	return sendResponse(
		{ status, entries: count, redis: redisOk ? "connected" : "unavailable" },
		200
	);
}

export async function replayEntries(req: {
	query: unknown;
}): Promise<ResponseObject> {
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
}
