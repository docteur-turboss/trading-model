import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import type {
	CursorPagination,
	OffsetPagination,
} from "@trading-model/primitives/pagination";
import type { Topic } from "@trading-model/primitives/primitives";
import type { DlqListOptions, StoredDlqEntry } from "../outbound/repository";
import type { ListEntriesQuery } from "./api-routes";

export interface DlqPaginationQuery {
	topic: Topic | undefined;
	pagination: OffsetPagination & Partial<CursorPagination>;
}

function _buildPaginationQuery({
	topic,
	limit,
	offset,
	cursor,
}: ListEntriesQuery): DlqPaginationQuery {
	return {
		topic,
		pagination: (cursor
			? { limit, cursor }
			: { offset, limit }) as OffsetPagination & Partial<CursorPagination>,
	};
}

export interface DlqListResponse {
	entries: StoredDlqEntry[];
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

export function createListEntries(entriesStore: {
	query(options: DlqListOptions): Promise<StoredDlqEntry[]>;
}): (query: ListEntriesQuery) => Promise<ResponseObject> {
	return (query) => _listEntries(entriesStore, query);
}

async function _listEntries(
	entriesStore: { query(options: DlqListOptions): Promise<StoredDlqEntry[]> },
	query: ListEntriesQuery
): Promise<ResponseObject> {
	const { topic, pagination } = _buildPaginationQuery(query);
	const { limit } = pagination;
	const offset = "offset" in pagination ? pagination.offset : 0;
	const cursor = "cursor" in pagination ? pagination.cursor : undefined;

	const entries = await entriesStore.query({
		topic,
		limit,
		offset,
		before: cursor,
	});
	return sendResponse(
		_buildListResponse({ entries, pagination }),
		HTTP_STATUS.OK
	);
}
