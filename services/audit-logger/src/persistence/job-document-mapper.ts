import type {
	Job,
	JobEvent,
} from "@trading-model/common/contracts/recovery.types";
import {
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { JobDocument } from "./job-document";

export class JobDocumentMapper {
	toDocument(job: Job): JobDocument {
		return {
			jobId: job.id,
			type: job.type,
			payload: job.payload,
			priority: job.priority,
			status: job.status,
			assignedWorkerId: job.assignedWorkerId,
			ackDeadline: job.ackDeadline,
			maxRetries: job.maxRetries,
			retryCount: job.retryCount,
			createdAt: new Date(job.createdAt),
			startedAt: job.startedAt ? new Date(job.startedAt) : undefined,
			completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
			result: job.result,
			error: job.error,
			history: _cloneHistory(job.history),
		};
	}

	fromDocument(doc: JobDocument): Job {
		return {
			id: doc.jobId,
			type: doc.type,
			payload: doc.payload as Job["payload"],
			priority: doc.priority,
			status: doc.status,
			assignedWorkerId: doc.assignedWorkerId,
			ackDeadline: PositiveInt.of(doc.ackDeadline),
			maxRetries: doc.maxRetries,
			retryCount: doc.retryCount,
			createdAt: UnixTimestamp.of(doc.createdAt.getTime()),
			startedAt: doc.startedAt
				? UnixTimestamp.of(doc.startedAt.getTime())
				: undefined,
			completedAt: doc.completedAt
				? UnixTimestamp.of(doc.completedAt.getTime())
				: undefined,
			result: doc.result,
			error: doc.error,
			history: _cloneHistory(doc.history),
		};
	}
}

function _cloneHistory(history: JobEvent[]): JobEvent[] {
	return history.map((entry: JobEvent) => ({ ...entry }));
}
