import {
	toCorrelationId,
	toServiceId,
	toTopic,
} from "@trading-model/common/domain/primitives";

import type {
	AuditEventQuery,
	AuditRepository,
} from "../adapters/outbound/persistence/audit-repository";
import { parseDateRange, parsePageAndLimit } from "../utils/query-params";
import { createQueryController } from "./controller-factory";

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

export function createEventsController(auditRepo: AuditRepository) {
	const { list, getById, stats } = createQueryController(
		auditRepo,
		_buildAuditEventQuery,
		{ notFoundMessage: "Event not found", idParam: "messageId" }
	);

	return { listEvents: list, getEvent: getById, getStats: stats };
}
