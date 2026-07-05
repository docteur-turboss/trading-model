import type { Collection, Db } from "mongodb";

import { isTerminalStatus, type Job, type JobStatus } from "@trading-model/common/contracts/recovery.types";

const MSET = "$set";
const MPUSH = "$push";
const MINC = "$inc";
const MNIN = "$nin";
const MIN = "$in";
const COLLECTION = "audit_jobs";

interface JobDocument {
	jobId: string;
	type: string;
	payload: unknown;
	priority: number;
	status: JobStatus;
	assignedWorkerId?: string;
	ackDeadline: number;
	maxRetries: number;
	retryCount: number;
	createdAt: Date;
	startedAt?: Date;
	completedAt?: Date;
	result?: unknown;
	error?: string;
	history: Array<{
		fromStatus: JobStatus;
		toStatus: JobStatus;
		timestamp: Date;
		reason: string;
	}>;
}

function toDocument(job: Job): JobDocument {
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
		history: job.history.map((entry) => ({
			fromStatus: entry.fromStatus,
			toStatus: entry.toStatus,
			timestamp: entry.timestamp,
			reason: entry.reason,
		})),
	};
}

function fromDocument(doc: JobDocument): Job {
	return {
		id: doc.jobId,
		type: doc.type,
		payload: doc.payload as Job["payload"],
		priority: doc.priority as 1 | 2 | 3 | 4 | 5,
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
		history: doc.history.map((entry) => ({
			fromStatus: entry.fromStatus,
			toStatus: entry.toStatus,
			timestamp: entry.timestamp,
			reason: entry.reason,
		})),
	};
}

export class JobRepository {
	private readonly _collection: Collection<JobDocument>;

	constructor(db: Db) {
		this._collection = db.collection<JobDocument>(COLLECTION);
	}

	async ensureIndexes(): Promise<void> {
		await this._collection.createIndex({ jobId: 1 }, { unique: true });
		await this._collection.createIndex({ status: 1 });
		await this._collection.createIndex(
			{ assignedWorkerId: 1 },
			{ sparse: true }
		);
		await this._collection.createIndex({ type: 1, status: 1 });
	}

	async insert(job: Job): Promise<void> {
		await this._collection.insertOne(toDocument(job));
	}

	async findById(jobId: string): Promise<Job | null> {
		const doc = await this._collection.findOne({ jobId });
		return doc ? fromDocument(doc) : null;
	}

	async updateStatus(
		jobId: string,
		status: JobStatus,
		extras?: Partial<
			Pick<Job, "result" | "error" | "assignedWorkerId" | "ackDeadline">
		>
	): Promise<void> {
		const current = await this._collection.findOne({ jobId });
		if (!current) {
			return;
		}

		const updateSet: Record<string, unknown> = {
			status,
			...(status === "running" ? { startedAt: new Date() } : {}),
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

		await this._collection.updateOne(
			{ jobId },
			{
				[MSET]: updateSet,
				[MPUSH]: {
					history: {
						fromStatus: current.status,
						toStatus: status,
						timestamp: new Date(),
						reason: extras?.error || status,
					},
				},
			}
		);
	}

	async incrementRetry(jobId: string): Promise<void> {
		await this._collection.updateOne({ jobId }, { [MINC]: { retryCount: 1 } });
	}

	async findNonTerminal(): Promise<Job[]> {
		const docs = await this._collection
			.find({ status: { [MNIN]: ["completed", "failed", "cancelled"] } })
			.toArray();
		return docs.map(fromDocument);
	}

	async findByWorker(workerId: string, statuses: JobStatus[]): Promise<Job[]> {
		const docs = await this._collection
			.find({ assignedWorkerId: workerId, status: { [MIN]: statuses } })
			.toArray();
		return docs.map(fromDocument);
	}

	async findByStatus(status: JobStatus): Promise<Job[]> {
		const docs = await this._collection.find({ status }).toArray();
		return docs.map(fromDocument);
	}
}
