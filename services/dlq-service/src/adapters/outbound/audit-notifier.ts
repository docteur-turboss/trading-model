import { DlqEvent, isDlqEventTopic } from "@trading-model/contracts/dlq-events";
import type { Topic } from "@trading-model/primitives/primitives";
import { publishDlqEvent } from "../../config/audit";
import type { ReplayAuditResult } from "../../domain/ports/replay.ports";

/** Does not wait: an incoming dead letter must not depend on the bus. */
export function notifyAddAudit(
	id: string,
	topic: Topic | undefined,
	reason: string | undefined,
	actor: string | null
): void {
	// Its own event, dead-lettered: publishing another would loop while
	// audit-logger cannot take them.
	if (isDlqEventTopic(topic)) {
		return;
	}
	void publishDlqEvent(DlqEvent.EntryAdded, {
		entryId: id,
		topic: topic ?? null,
		reason: reason ?? null,
		actor,
	});
}

/** True when message-manager accepted the event, or there was nothing to record. */
export function notifyReplayAudit(result: ReplayAuditResult): Promise<boolean> {
	const { batchId, topic, success, failed, actor } = result;
	if (success === 0 && failed === 0) {
		return Promise.resolve(true);
	}
	return publishDlqEvent(DlqEvent.ReplayCompleted, {
		batchId,
		topic: topic ?? null,
		replayed: success,
		failed,
		actor,
	});
}

/** True when message-manager accepted the event, or nothing was deleted. */
export function notifyDeleteAudit(
	ids: string[],
	deleted: number,
	actor: string | null
): Promise<boolean> {
	if (deleted === 0) {
		return Promise.resolve(true);
	}
	return publishDlqEvent(DlqEvent.EntriesDeleted, { ids, deleted, actor });
}
