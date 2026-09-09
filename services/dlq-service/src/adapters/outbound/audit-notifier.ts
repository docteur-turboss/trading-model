import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	AuditSummary,
	type Topic,
	toCorrelationId,
	toServiceId,
	toTopic,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import {
	type AuditEvent,
	Severity,
} from "@trading-model/validation/adapters/inbound/admin/audit.dto";
import { notifyAudit } from "../../config/audit";

export function notifyAddAudit(
	id: string,
	topic: Topic | undefined,
	reason: string | undefined
): void {
	void notifyAudit({
		timestamp: UnixTimestamp.now(),
		topic: toTopic(topic ?? "unknown"),
		publisher: toServiceId(ServiceInstanceName.DlqService),
		correlationId: toCorrelationId(id),
		summary: AuditSummary.of(`DLQ entry added: ${reason ?? "no reason"}`),
		severity: Severity.Warning,
	});
}

export interface ReplayAuditResult {
	batchId: string;
	topic?: Topic;
	success: number;
	failed: number;
}

export function notifyReplayAudit(result: ReplayAuditResult): void {
	const { batchId, topic, success, failed } = result;
	if (success === 0 && failed === 0) {
		return;
	}
	void notifyAudit(_buildReplayAuditEvent(batchId, topic, success, failed));
}

function _buildReplayAuditEvent(
	batchId: string,
	topic: Topic | undefined,
	success: number,
	failed: number
): AuditEvent {
	return {
		timestamp: UnixTimestamp.now(),
		topic: toTopic(topic ?? "unknown"),
		publisher: toServiceId(ServiceInstanceName.DlqService),
		correlationId: toCorrelationId(batchId),
		summary: AuditSummary.of(
			`DLQ replay: ${success} succeeded, ${failed} failed`
		),
		severity: failed > 0 ? Severity.Error : Severity.Info,
	};
}

export function notifyDeleteAudit(ids: string[], deleted: number): void {
	if (deleted === 0) {
		return;
	}
	void notifyAudit({
		timestamp: UnixTimestamp.now(),
		topic: toTopic("dlq-service"),
		publisher: toServiceId(ServiceInstanceName.DlqService),
		correlationId: toCorrelationId(ids[0]),
		summary: AuditSummary.of(`${deleted} DLQ entries deleted`),
		severity: Severity.Info,
	});
}
