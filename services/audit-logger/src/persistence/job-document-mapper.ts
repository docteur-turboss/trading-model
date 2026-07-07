import type { Job, JobEvent } from "@trading-model/common/contracts/recovery.types";
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
			createdAt: job.createdAt,
			startedAt: job.startedAt,
			completedAt: job.completedAt,
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
			ackDeadline: doc.ackDeadline,
			maxRetries: doc.maxRetries,
			retryCount: doc.retryCount,
			createdAt: doc.createdAt,
			startedAt: doc.startedAt,
			completedAt: doc.completedAt,
			result: doc.result,
			error: doc.error,
			history: _cloneHistory(doc.history),
		};
	}
}

function _cloneHistory(history: JobEvent[]): JobEvent[] {
	return history.map((e: JobEvent) => ({ ...e }));
}
