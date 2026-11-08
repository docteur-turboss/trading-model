import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import type { ApiRouteHandler } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import { EVENTS_INGESTED_TOTAL } from "../../../config/metrics";
import {
	buildAuditDocument,
	type DeliveredEnvelope,
} from "../../outbound/persistence/audit-document-builder";
import type { AuditRepository } from "../../outbound/persistence/audit-repository";
import type { AUDIT_API } from "../http/api-routes";

/** `POST /message`: the envelope is checked by the route (AUDIT_API.receive). */
export function createMessageHandler(
	auditRepo: AuditRepository,
	auditRetentionDays: number
): ApiRouteHandler<(typeof AUDIT_API)["receive"]> {
	return async ({ body }) => {
		// The route guarantees metadata with a topic; other fields are kept as sent.
		const envelope = body as DeliveredEnvelope;
		EVENTS_INGESTED_TOTAL.inc({ topic: envelope.metadata.topic });
		await auditRepo.insert(buildAuditDocument(envelope, auditRetentionDays));
		return sendResponse({ status: "recorded" }, 200 as HttpStatusCode);
	};
}
