import type { RequestHandler } from "express";
import { Router } from "express";
import type { AuditRepository } from "../adapters/outbound/persistence/audit-repository";
import { EVENTS_QUERY_DURATION_SECONDS } from "../config/metrics";
import { createEventsController } from "../controllers/events.controller";

function _withQueryTiming(handler: RequestHandler): RequestHandler {
	return async (req, res, next) => {
		const start = performance.now();
		try {
			return await handler(req, res, next);
		} finally {
			EVENTS_QUERY_DURATION_SECONDS.observe((performance.now() - start) / 1000);
		}
	};
}

export function eventsRoutes(auditRepo: AuditRepository): Router {
	const router = Router();
	const controller = createEventsController(auditRepo);

	router.get("/events", _withQueryTiming(controller.listEvents));
	router.get("/events/stats", _withQueryTiming(controller.getStats));
	router.get("/events/:messageId", _withQueryTiming(controller.getEvent));

	return router;
}
