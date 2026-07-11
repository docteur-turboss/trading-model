import {
	isTerminalStatus,
	type JobEvent,
	JobStatus,
	type JobUpdateExtras,
} from "@trading-model/common/contracts/recovery.types";
import { UnixTimestamp } from "@trading-model/common/domain/primitives";

export class JobStatusUpdater {
	buildUpdateSet(
		status: JobStatus,
		extras?: JobUpdateExtras
	): Record<string, unknown> {
		const updateSet: Record<string, unknown> = {
			status,
			...(status === JobStatus.RUNNING ? { startedAt: new Date() } : {}),
			...(isTerminalStatus(status) ? { completedAt: new Date() } : {}),
		};
		if (extras?.result !== undefined) {
			updateSet.result = extras.result;
		}
		if (extras?.error !== undefined) {
			updateSet.error = extras.error;
		}
		if (extras?.assignedWorkerId !== undefined) {
			updateSet.assignedWorkerId = extras.assignedWorkerId;
		}
		if (extras?.ackDeadline !== undefined) {
			updateSet.ackDeadline = extras.ackDeadline;
		}
		return updateSet;
	}

	buildHistoryEntry(
		fromStatus: JobStatus,
		toStatus: JobStatus,
		extras?: JobUpdateExtras
	): JobEvent {
		return {
			transition: { from: fromStatus, to: toStatus },
			timestamp: UnixTimestamp.now(),
			reason: extras?.error || toStatus,
		};
	}
}
