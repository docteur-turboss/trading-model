import { DlqEvent } from "@trading-model/contracts/dlq-events";
import { publishDlqEvent } from "../../config/audit";
import type { ReplayAuditResult } from "../../domain/ports/replay.port";

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
