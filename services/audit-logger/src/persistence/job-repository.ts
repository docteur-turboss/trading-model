import {
	PaginationQuery,
	type PaginationResult,
} from "@trading-model/common/domain/pagination";
import type {
	InstanceId,
	JobId,
} from "@trading-model/common/domain/primitives";
import type { MongoRepository } from "@trading-model/common/persistence/mongo-repository.interface";
import { findPaginated } from "@trading-model/common/persistence/mongo-utils";
import {
	type Job,
	JobStatus,
} from "@trading-model/validation/contracts/recovery.types";
import type { Collection, Db } from "mongodb";
import type { JobDocument } from "./job-document";
import { JobDocumentMapper } from "./job-document-mapper";
import { JobFilterBuilder } from "./job-filter-builder";
import { JobStatusUpdater } from "./job-status-updater";

const COLLECTION = "audit_jobs";

export { JobDocumentMapper } from "./job-document-mapper";
export { JobStatusUpdater } from "./job-status-updater";

export class JobRepository implements MongoRepository<Job> {
	private readonly _collection: Collection<JobDocument>;
	private readonly _mapper = new JobDocumentMapper();
	private readonly _statusUpdater = new JobStatusUpdater();
	private readonly _filterBuilder = new JobFilterBuilder();

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

	async findById(id: string): Promise<Job | null> {
		const doc = await this._collection.findOne({ jobId: id as JobId });
		return doc ? this._mapper.fromDocument(doc) : null;
	}

	insertBatch(_: Job[]): Promise<void> {
		throw new Error("Batch insert not supported for jobs");
	}

	async query(query: Record<string, unknown>): Promise<PaginationResult<Job>> {
		const { page, limit, skip } = PaginationQuery.compute(query);
		const filter = this._filterBuilder.build(query as never);
		const docs = await findPaginated(
			this._collection,
			filter as never,
			{ createdAt: -1 },
			skip,
			limit
		);
		const total = await this._collection.countDocuments(filter as never);
		return {
			docs: docs.map((doc) => this._mapper.fromDocument(doc)),
			total,
			page,
			limit,
		};
	}

	async updateStatus(
		jobId: JobId,
		status: JobStatus,
		extras?: import("@trading-model/validation/contracts/recovery.types").JobUpdateExtras
	): Promise<void> {
		const current = await this._collection.findOne({ jobId });
		if (!current) {
			return;
		}

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
					$nin: [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED],
				},
			})
			.toArray();
		return docs.map((doc) => this._mapper.fromDocument(doc));
	}

	async findByWorker(
		workerId: InstanceId,
		statuses: JobStatus[]
	): Promise<Job[]> {
		const docs = await this._collection
			.find({ assignedWorkerId: workerId, status: { $in: statuses } })
			.toArray();
		return docs.map((doc) => this._mapper.fromDocument(doc));
	}

	async findByStatus(status: JobStatus): Promise<Job[]> {
		const docs = await this._collection.find({ status }).toArray();
		return docs.map((doc) => this._mapper.fromDocument(doc));
	}
}
