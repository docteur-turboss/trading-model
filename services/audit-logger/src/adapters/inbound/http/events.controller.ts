import {
	toCorrelationId,
	toServiceId,
	toTopic,
} from "@trading-model/primitives/primitives";
import type { RequestHandler } from "express";
import type {
	AuditEventQuery,
	AuditRepository,
} from "../../outbound/persistence/audit-repository";
import { createQueryController } from "./controller-factory";
import { parseDateRange, parsePageAndLimit } from "./query-params";

function _buildAuditEventQuery(
	req: import("express").Request
): AuditEventQuery {
	const queryParams = req.query as Record<string, string | undefined>;
	const { topic, publisher, correlationId } = queryParams;
	const dateRange = parseDateRange(queryParams);
	const pagination = parsePageAndLimit(queryParams);

	return {
		topic: topic ? toTopic(topic) : undefined,
		publisher: publisher ? toServiceId(publisher) : undefined,
		correlationId: correlationId ? toCorrelationId(correlationId) : undefined,
		dateRange,
		...pagination,
	};
}

export function createEventsController(auditRepo: AuditRepository): {
	listEvents: RequestHandler;
	getEvent: RequestHandler;
	getStats: RequestHandler;
} {
	const { list, getById, stats } = createQueryController(
		auditRepo,
		_buildAuditEventQuery,
		{ notFoundMessage: "Event not found", idParam: "messageId" }
	);

	return { listEvents: list, getEvent: getById, getStats: stats };
}
