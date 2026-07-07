import {
	isTerminalStatus,
	JOB_STATUS,
	type JobEvent,
	type JobUpdateExtras,
} from "@trading-model/common/contracts/recovery.types";

export class JobStatusUpdater {
	buildUpdateSet(
		status: JOB_STATUS,
		extras?: JobUpdateExtras
	): Record<string, unknown> {
		const updateSet: Record<string, unknown> = {
			status,
			...(status === JOB_STATUS.RUNNING ? { startedAt: new Date() } : {}),
			...(isTerminalStatus(status) ? { completedAt: new Date() } : {}),
		};
		if (extras?.result !== undefined) updateSet.result = extras.result;
		if (extras?.error !== undefined) updateSet.error = extras.error;
		if (extras?.assignedWorkerId !== undefined)
			updateSet.assignedWorkerId = extras.assignedWorkerId;
		if (extras?.ackDeadline !== undefined)
			updateSet.ackDeadline = extras.ackDeadline;
		return updateSet;
	}

	buildHistoryEntry(
		fromStatus: JOB_STATUS,
		toStatus: JOB_STATUS,
		extras?: JobUpdateExtras
	): JobEvent {
		return {
			fromStatus,
			toStatus,
			timestamp: new Date(),
			reason: extras?.error || toStatus,
		};
	}
}
