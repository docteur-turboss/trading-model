import {
	JOB_STATUS,
	type Job,
} from "@trading-model/common/contracts/recovery.types";
import type {
	InstanceId,
	JobId,
} from "@trading-model/common/domain/primitives";
import type { Collection, Db } from "mongodb";
import type { JobDocument } from "./job-document";
import { JobDocumentMapper } from "./job-document-mapper";
import { JobStatusUpdater } from "./job-status-updater";

const COLLECTION = "audit_jobs";

export { JobDocumentMapper } from "./job-document-mapper";
export { JobStatusUpdater } from "./job-status-updater";

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
		extras?: import("@trading-model/common/contracts/recovery.types").JobUpdateExtras
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
