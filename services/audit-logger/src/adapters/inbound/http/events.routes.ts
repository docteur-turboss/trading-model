import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { ApiRoute } from "@trading-model/http/adapters/inbound/api-route/api-route";
import type { ApiRouteHandler } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import { DateRange } from "@trading-model/primitives/date-range";
import {
	Limit,
	PageNumber,
} from "@trading-model/primitives/primitives/page-number";
import { Router } from "express";
import { EVENTS_QUERY_DURATION_SECONDS } from "../../../config/metrics";
import type {
	AuditEventQuery,
	AuditRepository,
} from "../../outbound/persistence/audit-repository";
import { AUDIT_API, type ListEventsQuery } from "./api-routes";

/** Observes how long the handler takes (validation excluded). */
function timed<Route extends ApiRoute>(
	handler: ApiRouteHandler<Route>
): ApiRouteHandler<Route> {
	return async (input, req) => {
		const end = EVENTS_QUERY_DURATION_SECONDS.startTimer();
		try {
			return await handler(input, req);
		} finally {
			end();
		}
	};
}

function toAuditEventQuery(query: ListEventsQuery): AuditEventQuery {
	return {
		topic: query.topic,
		publisher: query.publisher,
		correlationId: query.correlationId,
		dateRange: DateRange.fromQueryParams(query.startDate, query.endDate),
		withTotal: query.withTotal,
		page: query.page === undefined ? undefined : PageNumber.of(query.page),
		limit: query.limit === undefined ? undefined : Limit.of(query.limit, 1000),
	};
}

export function eventsRoutes(auditRepo: AuditRepository): Router {
	const router = Router();

	mountRoute(
		router,
		AUDIT_API.listEvents,
		timed(async ({ query }) =>
			sendResponse(
				await auditRepo.query(toAuditEventQuery(query)),
				HTTP_STATUS.OK
			)
		)
	);
	mountRoute(
		router,
		AUDIT_API.getStats,
		timed(async () => sendResponse(await auditRepo.getStats(), HTTP_STATUS.OK))
	);
	mountRoute(
		router,
		AUDIT_API.getEvent,
		timed(async ({ params }) => {
			const event = await auditRepo.findById(params.messageId);
			return event
				? sendResponse(event, HTTP_STATUS.OK)
				: sendResponse({ error: "Event not found" }, HTTP_STATUS.NOT_FOUND);
		})
	);

	return router;
}
