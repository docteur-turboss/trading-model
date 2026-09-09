import type { LogLevel } from "@trading-model/common/config/log-types";
import {
	CorrelationId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { RequestHandler } from "express";
import type { LogQuery, LogRepository } from "../persistence/log-repository";
import { parseDateRange, parsePageAndLimit } from "../utils/query-params";
import { createQueryController } from "./controller-factory";

function _buildLogQueryParams(req: import("express").Request): LogQuery {
	const queryParams = req.query as Record<string, string | undefined>;
	const { search, correlationId, level, serviceName } = queryParams;
	const dateRange = parseDateRange(queryParams);
	const { page, limit } = parsePageAndLimit(queryParams);

	return {
		serviceName: serviceName ? toServiceId(serviceName) : undefined,
		level: level as LogLevel | undefined,
		correlationId: correlationId ? CorrelationId.of(correlationId) : undefined,
		dateRange,
		search: search as string | undefined,
		page,
		limit,
	};
}

export function getLogsController(logRepo: LogRepository): {
	listLogs: RequestHandler;
	getLogStats: RequestHandler;
	getLogById: RequestHandler;
} {
	const { list, getById, stats } = createQueryController(
		logRepo,
		_buildLogQueryParams,
		{ notFoundMessage: "Log entry not found" }
	);

	return {
		listLogs: list,
		getLogStats: stats,
		getLogById: getById,
	};
}
