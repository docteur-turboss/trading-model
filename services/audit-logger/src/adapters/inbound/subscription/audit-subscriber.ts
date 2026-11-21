import type { DeliveredMessage } from "@trading-model/broker-message/messages.controller";
import { EVENTS_INGESTED_TOTAL } from "../../../config/metrics";
import {
	buildAuditDocument,
	type DeliveredEnvelope,
} from "../../outbound/persistence/audit-document-builder";
import type { AuditRepository } from "../../outbound/persistence/audit-repository";

/** Records each message of the audited topics (the bus delivers at least once; a redelivery with the same messageId is skipped upstream). */
export function createMessageHandler(
	auditRepo: AuditRepository,
	auditRetentionDays: number
): (message: DeliveredMessage) => Promise<void> {
	return async (message) => {
		const envelope = message as DeliveredEnvelope;
		EVENTS_INGESTED_TOTAL.inc({ topic: envelope.metadata.topic });
		await auditRepo.insert(buildAuditDocument(envelope, auditRetentionDays));
	};
}
