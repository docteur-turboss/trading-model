import {
	isTerminalStatus,
	JOB_STATUS,
	type Job,
	type JobEvent,
	type JobPriority,
	type JobUpdateExtras,
} from "@trading-model/common/contracts/recovery.types";
import type {
	InstanceId,
	JobId,
	JobType,
} from "@trading-model/common/domain/primitives";
import type { Collection, Db } from "mongodb";

const COLLECTION = "audit_jobs";

interface JobDocument {
	jobId: JobId;
	type: JobType;
	payload: unknown;
	priority: JobPriority;
	status: JOB_STATUS;
	assignedWorkerId?: InstanceId;
	ackDeadline: number;
	maxRetries: number;
	retryCount: number;
	createdAt: Date;
	startedAt?: Date;
	completedAt?: Date;
	result?: unknown;
	error?: string;
	history: JobEvent[];
}

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
			history: job.history.map((e) => ({ ...e })),
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
			history: doc.history.map((e) => ({ ...e })),
		};
	}
}

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

export class JobRepository {
	private readonly _collection: Collection<JobDocument>;
	private readonly _mapper = new JobDocumentMapper();
	private readonly _statusUpdater = new JobStatusUpdater();

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
		await this._collection.insertOne(this._mapper.toDocument(job));
	}

	async findById(jobId: JobId): Promise<Job | null> {
		const doc = await this._collection.findOne({ jobId });
		return doc ? this._mapper.fromDocument(doc) : null;
	}

	async updateStatus(
		jobId: JobId,
		status: JOB_STATUS,
		extras?: JobUpdateExtras
	): Promise<void> {
		const current = await this._collection.findOne({ jobId });
		if (!current) return;

		const updateSet = this._statusUpdater.buildUpdateSet(status, extras);
		const historyEntry = this._statusUpdater.buildHistoryEntry(
			current.status,
			status,
			extras
		);

		await this._collection.updateOne(
			{ jobId },
			{ $set: updateSet, $push: { history: historyEntry } }
		);
	}

	async incrementRetry(jobId: JobId): Promise<void> {
		await this._collection.updateOne({ jobId }, { $inc: { retryCount: 1 } });
	}

	async findNonTerminal(): Promise<Job[]> {
		const docs = await this._collection
			.find({
				status: {
					$nin: [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.CANCELLED],
				},
			})
			.toArray();
		return docs.map((d) => this._mapper.fromDocument(d));
	}

	async findByWorker(
		workerId: InstanceId,
		statuses: JOB_STATUS[]
	): Promise<Job[]> {
		const docs = await this._collection
			.find({ assignedWorkerId: workerId, status: { $in: statuses } })
			.toArray();
		return docs.map((d) => this._mapper.fromDocument(d));
	}

	async findByStatus(status: JOB_STATUS): Promise<Job[]> {
		const docs = await this._collection.find({ status }).toArray();
		return docs.map((d) => this._mapper.fromDocument(d));
	}
}
