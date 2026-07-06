import { notifyAudit } from "../config/audit";

export function notifyAddAudit(
	id: string,
	topic: string | undefined,
	reason: string | undefined
): void {
	void notifyAudit({
		timestamp: new Date().toISOString(),
		topic: topic ?? "unknown",
		publisher: "dlq-service",
		correlationId: id,
		summary: `DLQ entry added: ${reason ?? "no reason"}`,
		severity: "WARNING",
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
	void notifyAudit({
		timestamp: new Date().toISOString(),
		topic: topic ?? "unknown",
		publisher: "dlq-service",
		correlationId: batchId,
		summary: `DLQ replay: ${success} succeeded, ${failed} failed`,
		severity: failed > 0 ? "ERROR" : "INFO",
	});
}

export function notifyAbandonAudit(count: number): void {
	if (count === 0) {
		return;
	}
	void notifyAudit({
		timestamp: new Date().toISOString(),
		topic: "dlq-service",
		publisher: "dlq-service",
		correlationId: "abandon",
		summary: `${count} DLQ entries abandoned after max retries`,
		severity: "CRITICAL",
	});
}

export function notifyDeleteAudit(ids: string[], deleted: number): void {
	if (deleted === 0) {
		return;
	}
	void notifyAudit({
		timestamp: new Date().toISOString(),
		topic: "dlq-service",
		publisher: "dlq-service",
		correlationId: ids[0],
		summary: `${deleted} DLQ entries deleted`,
		severity: "INFO",
	});
}
