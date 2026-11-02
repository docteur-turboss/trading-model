import { DlqEvent, isDlqEventTopic } from "@trading-model/contracts/dlq-events";
import type { Topic } from "@trading-model/primitives/primitives";
import { publishDlqEvent } from "../../config/audit";

export function notifyAddAudit(
	id: string,
	topic: Topic | undefined,
	reason: string | undefined
): void {
	// Its own event, dead-lettered: publishing another would loop while
	// audit-logger cannot take them.
	if (isDlqEventTopic(topic)) {
		return;
	}
	publishDlqEvent(DlqEvent.EntryAdded, {
		entryId: id,
		topic: topic ?? null,
		reason: reason ?? null,
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
	publishDlqEvent(DlqEvent.ReplayCompleted, {
		batchId,
		topic: topic ?? null,
		replayed: success,
		failed,
	});
}

export function notifyDeleteAudit(ids: string[], deleted: number): void {
	if (deleted === 0) {
		return;
	}
	publishDlqEvent(DlqEvent.EntriesDeleted, { ids, deleted });
}
