import type {
	JobId,
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { Job, QueuedJob } from "../types/job.types";
import { JobPriority, JobState } from "../types/job.types";

const PRIORITY_LEVELS: JobPriority[] = [
	JobPriority.LOWEST,
	JobPriority.LOW,
	JobPriority.MEDIUM,
	JobPriority.HIGH,
	JobPriority.HIGHEST,
];

export class InternalQueue {
	private readonly _queues: Map<JobPriority, QueuedJob[]> = new Map();
	private readonly _ackTimers: Map<string, NodeJS.Timeout> = new Map();
	private readonly _ackTimeoutMs: number;

	constructor(ackTimeoutMs: number) {
		this._ackTimeoutMs = ackTimeoutMs;
	}

	enqueue(job: Job): void {
		const priority = job.priority;
		if (!this._queues.has(priority)) {
			this._queues.set(priority, []);
		}
		this._queues.get(priority)!.push({
			job,
			state: JobState.Queued,
			deliveryAttempts: 0 as unknown as PositiveInt,
			expiresAt: 0 as unknown as UnixTimestamp,
		});
	}

	dequeue(): QueuedJob | null {
		for (const priority of PRIORITY_LEVELS) {
			const queue = this._queues.get(priority);
			if (queue && queue.length > 0) {
				return queue.shift()!;
			}
		}
		return null;
	}

	markDelivered(jobId: JobId, onAckTimeout?: (jobId: JobId) => void): void {
		const timer = setTimeout(() => {
			this._ackTimers.delete(jobId);
			onAckTimeout?.(jobId);
		}, this._ackTimeoutMs);
		this._ackTimers.set(jobId, timer);
	}

	ack(jobId: JobId): void {
		const timer = this._ackTimers.get(jobId);
		if (timer) {
			clearTimeout(timer);
			this._ackTimers.delete(jobId);
		}
	}

	depth(): number {
		let total = 0;
		for (const queue of this._queues.values()) {
			total += queue.length;
		}
		return total;
	}

	stop(): void {
		for (const timer of this._ackTimers.values()) {
			clearTimeout(timer);
		}
		this._ackTimers.clear();
	}
}
