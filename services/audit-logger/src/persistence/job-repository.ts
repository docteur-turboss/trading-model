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
} from "@trading-model/validation/domain/contracts/recovery.types";
import type { Collection, Db } from "mongodb";
import type { JobDocument } from "./job-document";
import { documentToJob, jobToDocument } from "./job-document-mapper";
import { buildJobFilter } from "./job-filter-builder";
import { buildHistoryEntry, buildUpdateSet } from "./job-status-updater";

const COLLECTION = "audit_jobs";

export class JobRepository implements MongoRepository<Job> {
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
		await this._collection.insertOne(jobToDocument(job));
	}

	async findById(id: string): Promise<Job | null> {
		const doc = await this._collection.findOne({ jobId: id as JobId });
		return doc ? documentToJob(doc) : null;
	}

	async insertBatch(jobs: Job[]): Promise<void> {
		if (jobs.length === 0) {
			return;
		}
		await this._collection.insertMany(jobs.map(jobToDocument));
	}

	async query(query: Record<string, unknown>): Promise<PaginationResult<Job>> {
		const { page, limit, skip } = PaginationQuery.compute(query);
		const filter = buildJobFilter(query as never);
		const docs = await findPaginated(
			this._collection,
			filter as never,
			{ createdAt: -1 },
			skip,
			limit
		);
		const total = await this._collection.countDocuments(filter as never);
		return {
			docs: docs.map((doc) => documentToJob(doc)),
			total,
			page,
			limit,
		};
	}

	async updateStatus(
		jobId: JobId,
		status: JobStatus,
		extras?: import("@trading-model/validation/domain/contracts/recovery.types").JobUpdateExtras
	): Promise<void> {
		const current = await this._collection.findOne({ jobId });
		if (!current) {
			return;
		}

		const updateSet = buildUpdateSet(status, extras);
		const historyEntry = buildHistoryEntry(current.status, status, extras);

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
		return docs.map((doc) => documentToJob(doc));
	}

	async findByWorker(
		workerId: InstanceId,
		statuses: JobStatus[]
	): Promise<Job[]> {
		const docs = await this._collection
			.find({ assignedWorkerId: workerId, status: { $in: statuses } })
			.toArray();
		return docs.map((doc) => documentToJob(doc));
	}

	async findByStatus(status: JobStatus): Promise<Job[]> {
		const docs = await this._collection.find({ status }).toArray();
		return docs.map((doc) => documentToJob(doc));
	}
}
