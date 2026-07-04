import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { RequestHandler } from "express";

import type {
	AuditEventQuery,
	AuditRepository,
} from "../persistence/audit-repository";

export function createEventsController(auditRepo: AuditRepository) {
	const listEvents: RequestHandler = catchSync(async (req) => {
		const queryParams = req.query as Record<string, string | undefined>;
		const { topic, publisher, correlationId, startDate, endDate, page, limit } =
			queryParams;

		const query: AuditEventQuery = {
			topic,
			publisher,
			correlationId,
			startDate: startDate ? new Date(startDate) : undefined,
			endDate: endDate ? new Date(endDate) : undefined,
			page: page ? Number.parseInt(page, 10) : undefined,
			limit: limit ? Number.parseInt(limit, 10) : undefined,
		};

		const result = await auditRepo.query(query);
		return sendResponse(result, 200);
	});

	const getEvent: RequestHandler = catchSync(async (req) => {
		const { messageId } = req.params as { messageId: string };
		const event = await auditRepo.findById(messageId);

		if (!event) {
			return sendResponse({ error: "Event not found" }, 404);
		}

		return sendResponse(event, 200);
	});

	const getStats: RequestHandler = catchSync(async () => {
		const stats = await auditRepo.getStats();
		return sendResponse(stats, 200);
	});

	return { listEvents, getEvent, getStats };
}
