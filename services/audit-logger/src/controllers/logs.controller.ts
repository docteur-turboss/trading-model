import { DateRange } from "@trading-model/common/domain/date-range";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";

import type { LogRepository } from "../persistence/log-repository";

function _buildLogQueryParams(
	req: import("express").Request
): Parameters<LogRepository["query"]>[0] {
	const startDate = req.query.startDate as string | undefined;
	const endDate = req.query.endDate as string | undefined;

	return {
		serviceName: req.query.serviceName as string | undefined,
		level: req.query.level as string | undefined,
		correlationId: req.query.correlationId as string | undefined,
		dateRange:
			startDate || endDate
				? new DateRange(
						startDate ? new Date(startDate) : undefined,
						endDate ? new Date(endDate) : undefined,
					)
				: undefined,
		search: req.query.search as string | undefined,
		page: req.query.page
			? Number.parseInt(req.query.page as string, 10)
			: undefined,
		limit: req.query.limit
			? Number.parseInt(req.query.limit as string, 10)
			: undefined,
	};
}

export function getLogsController(logRepo: LogRepository) {
	return {
		listLogs: catchSync(async (req) => {
			const result = await logRepo.query(_buildLogQueryParams(req));
			return sendResponse(result, 200);
		}),

		getLogStats: catchSync(async () => {
			const stats = await logRepo.getStats();
			return sendResponse(stats, 200);
		}),

		getLogById: catchSync(async (req) => {
			const doc = await logRepo.getById(String(req.params.id));
			if (!doc) {
				return sendResponse({ error: "Log entry not found" }, 404);
			}
			return sendResponse(doc, 200);
		}),
	};
}
