import { toServiceId } from "@trading-model/common/domain/primitives";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";

import type { LogRepository } from "../persistence/log-repository";
import { parseDateRange, parsePageAndLimit } from "../utils/query-params";

function _buildLogQueryParams(
	req: import("express").Request
): Parameters<LogRepository["query"]>[0] {
	const queryParams = req.query as Record<string, string | undefined>;
	const { search, correlationId, level, serviceName } = queryParams;
	const dateRange = parseDateRange(queryParams);
	const { page, limit } = parsePageAndLimit(queryParams);

	return {
		serviceName: serviceName ? toServiceId(serviceName) : undefined,
		level: level as string | undefined,
		correlationId: correlationId as string | undefined,
		dateRange,
		search: search as string | undefined,
		page,
		limit,
	};
}

export function getLogsController(logRepo: LogRepository) {
	return {
		listLogs: _createListLogsHandler(logRepo),
		getLogStats: _createGetLogStatsHandler(logRepo),
		getLogById: _createGetLogByIdHandler(logRepo),
	};
}

function _createListLogsHandler(logRepo: LogRepository): import("express").RequestHandler {
	return catchSync(async (req) => {
		const result = await logRepo.query(_buildLogQueryParams(req));
		return sendResponse(result, 200);
	});
}

function _createGetLogStatsHandler(logRepo: LogRepository): import("express").RequestHandler {
	return catchSync(async () => {
		const stats = await logRepo.getStats();
		return sendResponse(stats, 200);
	});
}

function _createGetLogByIdHandler(logRepo: LogRepository): import("express").RequestHandler {
	return catchSync(async (req) => {
		const doc = await logRepo.findById(String(req.params.id));
		if (!doc) {
			return sendResponse({ error: "Log entry not found" }, 404);
		}
		return sendResponse(doc, 200);
	});
}
