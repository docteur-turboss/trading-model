import {
	toCorrelationId,
	toServiceId,
	toTopic,
} from "@trading-model/common/domain/primitives";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { RequestHandler } from "express";

import type {
	AuditEventQuery,
	AuditRepository,
} from "../persistence/audit-repository";
import { parseDateRange, parsePageAndLimit } from "../utils/query-params";

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
	const listEvents = _createListEventsHandler(auditRepo);
	const getEvent = _createGetEventHandler(auditRepo);
	const getStats = _createGetStatsHandler(auditRepo);

	return { listEvents, getEvent, getStats };
}

function _createListEventsHandler(auditRepo: AuditRepository): RequestHandler {
	return catchSync(async (req) => {
		const query = _buildAuditEventQuery(req);
		const result = await auditRepo.query(query);
		return sendResponse(result, 200);
	});
}

function _createGetEventHandler(auditRepo: AuditRepository): RequestHandler {
	return catchSync(async (req) => {
		const { messageId } = req.params as { messageId: string };
		const event = await auditRepo.findById(messageId);

		if (!event) {
			return sendResponse({ error: "Event not found" }, 404);
		}

		return sendResponse(event, 200);
	});
}

function _createGetStatsHandler(auditRepo: AuditRepository): RequestHandler {
	return catchSync(async () => {
		const stats = await auditRepo.getStats();
		return sendResponse(stats, 200);
	});
}
