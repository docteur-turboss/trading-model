import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { ApiRouteHandler } from "@trading-model/http/api-route/mount-route";
import { sendResponse } from "@trading-model/http/response-exception";
import { EVENTS_INGESTED_TOTAL } from "../../../config/metrics";
import {
	buildAuditDocument,
	type DeliveredEnvelope,
} from "../../outbound/persistence/audit-document-builder";
import type { AuditRepository } from "../../outbound/persistence/audit-repository";
import type { AUDIT_API } from "../http/api-routes";

/** Records one delivered message, from the `POST /message` callback or the bus consumer (`brokerMessage.on`). */
export function createAuditRecorder(
	auditRepo: AuditRepository,
	auditRetentionDays: number
): (envelope: DeliveredEnvelope) => Promise<void> {
	return async (envelope) => {
		EVENTS_INGESTED_TOTAL.inc({ topic: envelope.metadata.topic });
		await auditRepo.insert(buildAuditDocument(envelope, auditRetentionDays));
	};
}

/** `POST /message`: the envelope is checked by the route (AUDIT_API.receive). */
export function createMessageHandler(
	auditRepo: AuditRepository,
	auditRetentionDays: number
): ApiRouteHandler<(typeof AUDIT_API)["receive"]> {
	const record = createAuditRecorder(auditRepo, auditRetentionDays);
	return async ({ body }) => {
		// The route guarantees metadata with a topic; other fields are kept as sent.
		await record(body as DeliveredEnvelope);
		return sendResponse({ status: "recorded" }, HTTP_STATUS.OK);
	};
}
