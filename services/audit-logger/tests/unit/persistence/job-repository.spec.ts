import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_COLLECTION = {
	insertOne: jest.fn<any>(),
	findOne: jest.fn<any>(),
	updateOne: jest.fn<any>(),
	find: jest.fn<any>(),
	createIndex: jest.fn<any>(),
};

const MOCK_DB = {
	collection: jest.fn<any>().mockReturnValue(MOCK_COLLECTION),
};

jest.mock("mongodb", () => ({
	Db: jest.fn(),
	Collection: jest.fn(),
}));

import { JobRepository } from "../../../src/persistence/job-repository";
import type { Job } from "../../../src/types/job.types";

function makeJob(overrides: Partial<Job> = {}): Job {
	return {
		id: "job-1",
		type: "test-type",
		payload: { foo: "bar" },
		priority: 3,
		status: "queued",
		assignedWorkerId: undefined,
		ackDeadline: Date.now() + 30000,
		maxRetries: 3,
		retryCount: 0,
		createdAt: new Date(),
		startedAt: undefined,
		completedAt: undefined,
		result: undefined,
		error: undefined,
		history: [],
		...overrides,
	};
}

describe("JobRepository", () => {
	let repository: JobRepository;

	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_COLLECTION.find.mockReturnValue({ toArray: jest.fn<any>() });
		repository = new JobRepository(MOCK_DB as any);
	});

	describe("constructor", () => {
		it('should call db.collection with "audit_jobs"', () => {
			expect(MOCK_DB.collection).toHaveBeenCalledWith("audit_jobs");
		});
	});

	describe("ensureIndexes", () => {
		it("should create 4 indexes", async () => {
			MOCK_COLLECTION.createIndex.mockResolvedValue(undefined);

			await repository.ensureIndexes();

			expect(MOCK_COLLECTION.createIndex).toHaveBeenCalledTimes(4);
			expect(MOCK_COLLECTION.createIndex).toHaveBeenCalledWith(
				{ jobId: 1 },
				{ unique: true }
			);
			expect(MOCK_COLLECTION.createIndex).toHaveBeenCalledWith({ status: 1 });
			expect(MOCK_COLLECTION.createIndex).toHaveBeenCalledWith(
				{ assignedWorkerId: 1 },
				{ sparse: true }
			);
			expect(MOCK_COLLECTION.createIndex).toHaveBeenCalledWith({
				type: 1,
				status: 1,
			});
		});
	});

	describe("insert", () => {
		it("should call insertOne with a document", async () => {
			MOCK_COLLECTION.insertOne.mockResolvedValue({ insertedId: "job-1" });
			const job = makeJob();

			await repository.insert(job);

			expect(MOCK_COLLECTION.insertOne).toHaveBeenCalledTimes(1);
			const doc = (MOCK_COLLECTION.insertOne as jest.Mock).mock
				.calls[0][0] as any;
			expect(doc.jobId).toBe("job-1");
			expect(doc.type).toBe("test-type");
		});

		it("should map history entries in toDocument", async () => {
			MOCK_COLLECTION.insertOne.mockResolvedValue({ insertedId: "job-1" });
			const job = makeJob({
				history: [
					{
						transition: { from: "queued", to: "assigned" },
						timestamp: new Date("2024-01-01"),
						reason: "assign",
					},
					{
						transition: { from: "assigned", to: "running" },
						timestamp: new Date("2024-01-02"),
						reason: "start",
					},
				],
			});

			await repository.insert(job);

			const doc = (MOCK_COLLECTION.insertOne as jest.Mock).mock
				.calls[0][0] as any;
			expect(doc.history).toHaveLength(2);
			expect(doc.history[0]).toMatchObject({
				transition: { from: "queued", to: "assigned" },
				reason: "assign",
			});
			expect(doc.history[1]).toMatchObject({
				transition: { from: "assigned", to: "running" },
				reason: "start",
			});
		});
	});

	describe("findById", () => {
		it("should return a job when found", async () => {
			const doc = {
				jobId: "job-1",
				type: "test",
				payload: {},
				priority: 3,
				status: "queued",
				ackDeadline: 0,
				maxRetries: 3,
				retryCount: 0,
				createdAt: new Date(),
				history: [],
			};
			MOCK_COLLECTION.findOne.mockResolvedValue(doc);

			const result = await repository.findById("job-1");

			expect(MOCK_COLLECTION.findOne).toHaveBeenCalledWith({ jobId: "job-1" });
			expect(result).toBeDefined();
			expect(result!.id).toBe("job-1");
		});

		it("should return null when not found", async () => {
			MOCK_COLLECTION.findOne.mockResolvedValue(null);

			const result = await repository.findById("nonexistent");

			expect(result).toBeNull();
		});

		it("should map history entries in fromDocument", async () => {
			const doc = {
				jobId: "job-1",
				type: "test",
				payload: {},
				priority: 3,
				status: "queued",
				ackDeadline: 0,
				maxRetries: 3,
				retryCount: 0,
				createdAt: new Date(),
				history: [
					{
						transition: { from: "queued", to: "assigned" },
						timestamp: new Date("2024-01-01"),
						reason: "assign",
					},
				],
			};
			MOCK_COLLECTION.findOne.mockResolvedValue(doc);

			const result = await repository.findById("job-1");

			expect(result!.history).toHaveLength(1);
			expect(result!.history[0]).toMatchObject({
				transition: { from: "queued", to: "assigned" },
				reason: "assign",
			});
		});
	});

	describe("updateStatus", () => {
		it("should update status and push history", async () => {
			const currentDoc = { jobId: "job-1", status: "queued", history: [] };
			MOCK_COLLECTION.findOne.mockResolvedValue(currentDoc);
			MOCK_COLLECTION.updateOne.mockResolvedValue({ modifiedCount: 1 });

			await repository.updateStatus("job-1", "assigned", {
				assignedWorkerId: "w1",
				ackDeadline: 1000,
			});

			expect(MOCK_COLLECTION.updateOne).toHaveBeenCalledWith(
				{ jobId: "job-1" },
				expect.objectContaining({
					$set: expect.objectContaining({
						status: "assigned",
						assignedWorkerId: "w1",
						ackDeadline: 1000,
					}),
					$push: expect.objectContaining({
						history: expect.objectContaining({
							transition: { from: "queued", to: "assigned" },
						}),
					}),
				})
			);
		});

		it("should do nothing when current document is not found", async () => {
			MOCK_COLLECTION.findOne.mockResolvedValue(null);

			await repository.updateStatus("nonexistent", "completed");

			expect(MOCK_COLLECTION.updateOne).not.toHaveBeenCalled();
		});

		it("should set startedAt when status becomes running", async () => {
			const currentDoc = { jobId: "job-1", status: "assigned", history: [] };
			MOCK_COLLECTION.findOne.mockResolvedValue(currentDoc);
			MOCK_COLLECTION.updateOne.mockResolvedValue({ modifiedCount: 1 });

			await repository.updateStatus("job-1", "running");

			const updateCall = (MOCK_COLLECTION.updateOne as jest.Mock).mock
				.calls[0][1] as any;
			expect(updateCall.$set.startedAt).toBeDefined();
			expect(updateCall.$set.startedAt).toBeInstanceOf(Date);
		});

		it("should set completedAt when status becomes completed or failed", async () => {
			const currentDoc = { jobId: "job-1", status: "running", history: [] };
			MOCK_COLLECTION.findOne.mockResolvedValue(currentDoc);
			MOCK_COLLECTION.updateOne.mockResolvedValue({ modifiedCount: 1 });

			await repository.updateStatus("job-1", "completed", {
				result: "success",
			});

			const updateCall = (MOCK_COLLECTION.updateOne as jest.Mock).mock
				.calls[0][1] as any;
			expect(updateCall.$set.completedAt).toBeDefined();
			expect(updateCall.$set.completedAt).toBeInstanceOf(Date);
			expect(updateCall.$set.result).toBe("success");
		});

		it("should set error when extras.error is provided", async () => {
			const currentDoc = { jobId: "job-1", status: "running", history: [] };
			MOCK_COLLECTION.findOne.mockResolvedValue(currentDoc);
			MOCK_COLLECTION.updateOne.mockResolvedValue({ modifiedCount: 1 });

			await repository.updateStatus("job-1", "failed", {
				error: "Something went wrong",
			});

			const updateCall = (MOCK_COLLECTION.updateOne as jest.Mock).mock
				.calls[0][1] as any;
			expect(updateCall.$set.error).toBe("Something went wrong");
			expect(updateCall.$set.completedAt).toBeInstanceOf(Date);
		});
	});

	describe("incrementRetry", () => {
		it("should increment retryCount by 1", async () => {
			MOCK_COLLECTION.updateOne.mockResolvedValue({ modifiedCount: 1 });

			await repository.incrementRetry("job-1");

			expect(MOCK_COLLECTION.updateOne).toHaveBeenCalledWith(
				{ jobId: "job-1" },
				{ $inc: { retryCount: 1 } }
			);
		});
	});

	describe("findNonTerminal", () => {
		it("should find all non-terminal jobs", async () => {
			const docs = [
				{ jobId: "j1", status: "queued", history: [] },
				{ jobId: "j2", status: "running", history: [] },
			];
			MOCK_COLLECTION.find.mockReturnValue({
				toArray: jest.fn<any>().mockResolvedValue(docs),
			});

			const results = await repository.findNonTerminal();

			expect(MOCK_COLLECTION.find).toHaveBeenCalledWith({
				status: { $nin: ["completed", "failed", "cancelled"] },
			});
			expect(results).toHaveLength(2);
		});
	});

	describe("findByWorker", () => {
		it("should find jobs by worker ID and statuses", async () => {
			const docs = [
				{
					jobId: "j1",
					assignedWorkerId: "w1",
					status: "assigned",
					history: [],
				},
			];
			MOCK_COLLECTION.find.mockReturnValue({
				toArray: jest.fn<any>().mockResolvedValue(docs),
			});

			const results = await repository.findByWorker("w1", [
				"assigned",
				"running",
			]);

			expect(MOCK_COLLECTION.find).toHaveBeenCalledWith({
				assignedWorkerId: "w1",
				status: { $in: ["assigned", "running"] },
			});
			expect(results).toHaveLength(1);
		});
	});

	describe("findByStatus", () => {
		it("should find jobs by status", async () => {
			const docs = [{ jobId: "j1", status: "queued", history: [] }];
			MOCK_COLLECTION.find.mockReturnValue({
				toArray: jest.fn<any>().mockResolvedValue(docs),
			});

			const results = await repository.findByStatus("queued");

			expect(MOCK_COLLECTION.find).toHaveBeenCalledWith({ status: "queued" });
			expect(results).toHaveLength(1);
		});
	});
});
