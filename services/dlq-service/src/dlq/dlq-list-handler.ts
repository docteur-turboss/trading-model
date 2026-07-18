import type {
	CursorPagination,
	OffsetPagination,
} from "@trading-model/common/domain/pagination";
import { type Topic, toTopic } from "@trading-model/common/domain/primitives";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { dlqRepository } from "./repository";

export interface DlqPaginationQuery {
	topic: Topic | undefined;
	pagination: OffsetPagination & Partial<CursorPagination>;
}

function _buildPaginationQuery(
	query: Record<string, unknown>
): DlqPaginationQuery {
	const cursor = query.cursor as string | undefined;
	const rawTopic = query.topic as string | undefined;
	const topic = rawTopic ? toTopic(rawTopic) : undefined;
	const limit = Math.min(
		Number.parseInt(String(query.limit ?? "10"), 10) || 100,
		1000
	);
	const offset = cursor
		? 0
		: Math.max(Number.parseInt((query.offset as string) ?? "0", 10) || 0, 0);
	return { topic, pagination: cursor ? { limit, cursor } : { offset, limit } };
}

export interface DlqListResponse {
	entries: import("./repository").StoredDlqEntry[];
	pagination: OffsetPagination & Partial<CursorPagination>;
}

function _buildListResponse(params: DlqListResponse): Record<string, unknown> {
	const { pagination } = params;
	const hasMore = params.entries.length === pagination.limit;
	const response: Record<string, unknown> = {
		entries: params.entries,
		count: params.entries.length,
		hasMore,
	};
	if (!("cursor" in pagination)) {
		response.offset = pagination.offset;
	}
	if (hasMore && params.entries.length > 0) {
		response.cursor = params.entries[params.entries.length - 1].id;
	}
	return response;
}

export async function listEntries(req: {
	query: Record<string, unknown>;
}): Promise<ResponseObject> {
	const { topic, pagination } = _buildPaginationQuery(req.query);
	const { limit } = pagination;
	const offset = "offset" in pagination ? pagination.offset : 0;
	const cursor = "cursor" in pagination ? pagination.cursor : undefined;

	const entries = await dlqRepository.query({
		topic,
		limit,
		offset,
		before: cursor,
	});
	return sendResponse(_buildListResponse({ entries, pagination }), 200);
}
