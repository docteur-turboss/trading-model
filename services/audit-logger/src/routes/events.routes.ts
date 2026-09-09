import { Router } from "express";
import type { AuditRepository } from "../adapters/outbound/persistence/audit-repository";
import { createEventsController } from "../controllers/events.controller";

export function eventsRoutes(auditRepo: AuditRepository): Router {
	const router = Router();
	const controller = createEventsController(auditRepo);

	router.get("/events", controller.listEvents);
	router.get("/events/stats", controller.getStats);
	router.get("/events/:messageId", controller.getEvent);

	return router;
}
