import {
	type AuditEvent,
	Severity,
} from "@trading-model/common/contracts/admin/audit.dto";
import {
	toCorrelationId,
	toServiceId,
	toTopic,
	type UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { notifyAudit } from "../config/audit";

export function notifyAddAudit(
	id: string,
	topic: string | undefined,
	reason: string | undefined
): void {
	void notifyAudit({
		timestamp: Date.now() as unknown as UnixTimestamp,
		topic: toTopic(topic ?? "unknown"),
		publisher: toServiceId("dlq-service"),
		correlationId: toCorrelationId(id),
		summary: `DLQ entry added: ${reason ?? "no reason"}`,
		severity: Severity.Warning,
	});
}

export interface ReplayAuditResult {
	batchId: string;
	topic?: string;
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
	topic: string | undefined,
	success: number,
	failed: number
): AuditEvent {
	return {
		timestamp: Date.now() as unknown as UnixTimestamp,
		topic: toTopic(topic ?? "unknown"),
		publisher: toServiceId("dlq-service"),
		correlationId: toCorrelationId(batchId),
		summary: `DLQ replay: ${success} succeeded, ${failed} failed`,
		severity: failed > 0 ? Severity.Error : Severity.Info,
	};
}

export function notifyAbandonAudit(count: number): void {
	if (count === 0) {
		return;
	}
	void notifyAudit({
		timestamp: Date.now() as unknown as UnixTimestamp,
		topic: toTopic("dlq-service"),
		publisher: toServiceId("dlq-service"),
		correlationId: toCorrelationId("abandon"),
		summary: `${count} DLQ entries abandoned after max retries`,
		severity: Severity.Critical,
	});
}

export function notifyDeleteAudit(ids: string[], deleted: number): void {
	if (deleted === 0) {
		return;
	}
	void notifyAudit({
		timestamp: Date.now() as unknown as UnixTimestamp,
		topic: toTopic("dlq-service"),
		publisher: toServiceId("dlq-service"),
		correlationId: toCorrelationId(ids[0]),
		summary: `${deleted} DLQ entries deleted`,
		severity: Severity.Info,
	});
}
