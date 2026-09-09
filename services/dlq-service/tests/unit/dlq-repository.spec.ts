import { describe, expect, it, jest } from "@jest/globals";

const mockInsertOne = jest.fn();
const mockFind = jest.fn();
const mockFindOne = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockBulkWrite = jest.fn();
const mockDeleteMany = jest.fn();
const mockUpdateOne = jest.fn();
const mockUpdateMany = jest.fn();
const mockEstimatedDocumentCount = jest.fn();

function createCursor(docs: unknown[]) {
	let i = 0;
	return {
		toArray: () => Promise.resolve(docs),
		[Symbol.asyncIterator]: () => ({
			next: () => {
				if (i < docs.length) {
					return Promise.resolve({ value: docs[i++], done: false });
				}
				return Promise.resolve({ value: undefined, done: true });
			},
		}),
	};
}

const mockCollection = jest.fn(() => ({
	insertOne: mockInsertOne,
	find: mockFind,
	findOne: mockFindOne,
	findOneAndUpdate: mockFindOneAndUpdate,
	bulkWrite: mockBulkWrite,
	deleteMany: mockDeleteMany,
	updateOne: mockUpdateOne,
	updateMany: mockUpdateMany,
	estimatedDocumentCount: mockEstimatedDocumentCount,
}));

jest.mock("../../src/config/db", () => ({
	getCollection: mockCollection,
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		DLQ_RETRY_MAX_ATTEMPTS: 3,
		MAX_ENTRIES: 100,
		DLQ_AUTO_RETRY_LIMIT: 50,
	},
}));

const DlqEntry = {
	topic: "test.topic.event",
	message: { data: 1 },
	reason: "timeout",
	deliveryAttempt: 2,
	timestamp: new Date().toISOString(),
};

describe("DlqRepository", () => {
	let DlqRepositoryClass: {
		new (): {
			insert: (...args: never[]) => Promise<string>;
			query: (...args: never[]) => Promise<Record<string, unknown>[]>;
			delete: (...args: never[]) => Promise<number>;
			count: (...args: never[]) => Promise<number>;
			prune: (...args: never[]) => Promise<number>;
			listQueuable: (...args: never[]) => Promise<string[]>;
		};
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/adapters/outbound/repository");
		DlqRepositoryClass = mod.DlqRepository;
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});

	describe("insert", () => {
		beforeEach(() => {
			mockFindOne.mockReset();
			mockInsertOne.mockReset();
		});

		it("should insert a new document and return the id", () => {
			const repo = new DlqRepositoryClass();
			mockFindOne.mockResolvedValue(null);
			mockInsertOne.mockResolvedValue({
				insertedId: { toHexString: () => "abc123" },
			});

			return repo.insert(DlqEntry).then((id: string) => {
				expect(id).toBe("abc123");
				expect(mockInsertOne).toHaveBeenCalledWith(
					expect.objectContaining({
						topic: "test.topic.event",
						retryCount: 0,
						messageId: expect.any(String),
						contentHash: expect.any(String),
						dlqPassCount: 1,
					})
				);
			});
		});

		it("should detect ping-pong and increment dlqPassCount", () => {
			const repo = new DlqRepositoryClass();
			mockFindOne.mockResolvedValueOnce({
				_id: { toHexString: () => "prev-id" },
				dlqPassCount: 1,
			});
			mockFindOne.mockResolvedValue(null);
			mockInsertOne.mockResolvedValue({
				insertedId: { toHexString: () => "abc123" },
			});

			return repo.insert(DlqEntry).then((id: string) => {
				expect(id).toBe("abc123");
				expect(mockInsertOne).toHaveBeenCalledWith(
					expect.objectContaining({
						contentHash: expect.any(String),
						dlqPassCount: 2,
					})
				);
				const callArg = mockInsertOne.mock.calls[0][0] as Record<
					string,
					unknown
				>;
				expect(callArg.status).toBeUndefined();
			});
		});

		it("should auto-abandon on excessive ping-pong cycles", () => {
			const repo = new DlqRepositoryClass();
			mockFindOne.mockResolvedValueOnce({
				_id: { toHexString: () => "prev-id" },
				dlqPassCount: 3,
			});
			mockFindOne.mockResolvedValue(null);
			mockInsertOne.mockResolvedValue({
				insertedId: { toHexString: () => "abc123" },
			});

			return repo.insert(DlqEntry).then((id: string) => {
				expect(id).toBe("abc123");
				expect(mockInsertOne).toHaveBeenCalledWith(
					expect.objectContaining({
						dlqPassCount: 4,
						status: "abandoned",
						lastError: expect.stringContaining("Ping-pong detected"),
					})
				);
			});
		});

		it("should return existing id on duplicate (dedup via findOne)", () => {
			const repo = new DlqRepositoryClass();
			mockFindOne.mockResolvedValueOnce(null);
			mockFindOne.mockResolvedValue({
				_id: { toHexString: () => "existing-id" },
			});

			return repo.insert(DlqEntry).then((id: string) => {
				expect(id).toBe("existing-id");
				expect(mockFindOne).toHaveBeenCalledTimes(2);
				expect(mockInsertOne).not.toHaveBeenCalled();
			});
		});

		it("should handle race condition on duplicate insert (E11000)", () => {
			const repo = new DlqRepositoryClass();
			mockFindOne.mockResolvedValueOnce(null);
			mockFindOne.mockResolvedValueOnce(null);
			const duplicateError = new Error("E11000 duplicate key");
			(duplicateError as Record<string, unknown>).code = 11000;
			mockInsertOne.mockRejectedValueOnce(duplicateError);
			mockFindOne.mockResolvedValueOnce({
				_id: { toHexString: () => "race-id" },
			});

			return repo.insert(DlqEntry).then((id: string) => {
				expect(id).toBe("race-id");
				expect(mockFindOne).toHaveBeenCalledTimes(3);
				expect(mockInsertOne).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe("query", () => {
		beforeEach(() => {
			mockFind.mockReset();
			mockFind.mockReturnValue(createCursor([]));
		});

		it("should return mapped documents with offset", () => {
			const repo = new DlqRepositoryClass();
			const fakeDoc = {
				_id: { toHexString: () => "id1" },
				topic: "t1",
				message: { x: 1 },
				reason: "r1",
				deliveryAttempt: 1,
				createdAt: new Date("2024-01-01"),
			};
			mockFind.mockReturnValueOnce(createCursor([fakeDoc]));

			return repo
				.query({ limit: 10, offset: 0 })
				.then((result: Array<{ id: string }>) => {
					expect(result).toHaveLength(1);
					expect(result[0].id).toBe("id1");
					expect(mockFind).toHaveBeenCalledWith(
						{},
						expect.objectContaining({
							sort: { createdAt: -1 },
							skip: 0,
							limit: 10,
						})
					);
				});
		});

		it("should support cursor-based pagination with before parameter", () => {
			const repo = new DlqRepositoryClass();
			const fakeDocs = [
				{
					_id: { toHexString: () => "id2" },
					topic: "t1",
					message: { x: 2 },
					reason: null,
					deliveryAttempt: 1,
					createdAt: new Date("2024-01-02"),
				},
				{
					_id: { toHexString: () => "id1" },
					topic: "t1",
					message: { x: 1 },
					reason: null,
					deliveryAttempt: 1,
					createdAt: new Date("2024-01-01"),
				},
			];
			mockFind.mockReturnValueOnce(createCursor(fakeDocs));

			return repo
				.query({ limit: 10, offset: 0, before: "aaaaaaaaaaaaaaaaaaaaaaaa" })
				.then((result: Array<{ id: string }>) => {
					expect(result).toHaveLength(2);
					expect(result[0].id).toBe("id2");
					expect(mockFind).toHaveBeenCalledWith(
						{ _id: { $lt: expect.any(Object) } },
						expect.objectContaining({
							sort: { createdAt: -1 },
							skip: 0,
							limit: 10,
						})
					);
				});
		});
	});

	describe("delete", () => {
		it("should delete only non-processing documents and return count", () => {
			const repo = new DlqRepositoryClass();
			mockDeleteMany.mockResolvedValueOnce({ deletedCount: 3 });
			return repo
				.delete([
					"aaaaaaaaaaaaaaaaaaaaaaaa",
					"bbbbbbbbbbbbbbbbbbbbbbbb",
					"cccccccccccccccccccccccc",
				])
				.then((result: number) => {
					expect(result).toBe(3);
					expect(mockDeleteMany).toHaveBeenCalledWith({
						_id: {
							$in: [expect.any(Object), expect.any(Object), expect.any(Object)],
						},
						processingAt: { $exists: false },
					});
				});
		});
	});

	describe("count", () => {
		it("should return document count", () => {
			const repo = new DlqRepositoryClass();
			mockEstimatedDocumentCount.mockResolvedValueOnce(42);

			return repo.count().then((result: number) => {
				expect(result).toBe(42);
			});
		});
	});

	describe("prune", () => {
		it("should return 0 if no documents to prune", () => {
			const repo = new DlqRepositoryClass();
			mockFind.mockReturnValueOnce(createCursor([]));

			return repo.prune(100).then((result: number) => {
				expect(result).toBe(0);
			});
		});

		it("should delete documents older than the eldest kept entry by createdAt", () => {
			const repo = new DlqRepositoryClass();
			const eldestDate = new Date("2024-06-01");
			mockFind.mockReturnValueOnce(createCursor([{ createdAt: eldestDate }]));
			mockDeleteMany.mockResolvedValueOnce({ deletedCount: 50 });

			return repo.prune(100).then((result: number) => {
				expect(result).toBe(50);
				expect(mockDeleteMany).toHaveBeenCalledWith({
					createdAt: { $lt: eldestDate },
					processingAt: { $exists: false },
				});
			});
		});
	});
});

describe("DlqClaimManager", () => {
	let DlqClaimManagerClass: {
		new (): {
			claimEntriesForRetry: (
				...args: never[]
			) => Promise<Record<string, unknown>[]>;
		};
	};

	beforeAll(() => {
		const mod = jest.requireActual(
			"../../src/application/services/claim-manager"
		);
		DlqClaimManagerClass = mod.DlqClaimManager;
	});

	describe("claimEntriesForRetry", () => {
		beforeEach(() => {
			mockFind.mockReset();
			mockFind.mockReturnValue(createCursor([]));
			mockBulkWrite.mockReset();
			mockBulkWrite.mockResolvedValue({ modifiedCount: 0 });
		});

		it("should claim entries via bulkWrite (2 round-trips instead of N)", () => {
			const cm = new DlqClaimManagerClass();
			const fakeDoc1 = {
				_id: { toHexString: () => "id1" },
				topic: "t1",
				message: { x: 1 },
				reason: null,
				deliveryAttempt: 1,
				createdAt: new Date("2024-01-01"),
			};
			const fakeDoc2 = {
				_id: { toHexString: () => "id2" },
				topic: "t2",
				message: { y: 2 },
				reason: null,
				deliveryAttempt: 1,
				createdAt: new Date("2024-01-02"),
			};
			const fakeDocs = [fakeDoc1, fakeDoc2];

			mockFind
				.mockReturnValueOnce(createCursor(fakeDocs))
				.mockReturnValueOnce(createCursor(fakeDocs));
			mockBulkWrite.mockResolvedValueOnce({ modifiedCount: 2 });

			return cm
				.claimEntriesForRetry({
					limit: 10,
					batchId: "batch-1",
					instanceId: "instance-1",
				})
				.then((result: Array<{ id: string }>) => {
					expect(result).toHaveLength(2);
					expect(result[0].id).toBe("id1");
					expect(result[1].id).toBe("id2");
					expect(mockFind).toHaveBeenCalledWith(
						{
							retryCount: { $lt: 3 },
							processingAt: { $exists: false },
							status: { $nin: ["completed", "abandoned"] },
							consecutiveErrors: { $lt: 3 },
						},
						expect.objectContaining({ sort: { createdAt: -1 }, limit: 10 })
					);
					expect(mockBulkWrite).toHaveBeenCalledTimes(1);
				});
		});

		it("should return empty if no candidates found", () => {
			const cm = new DlqClaimManagerClass();

			return cm
				.claimEntriesForRetry({
					limit: 10,
					batchId: "batch-1",
					instanceId: "instance-1",
				})
				.then((result: Array<{ id: string }>) => {
					expect(result).toHaveLength(0);
					expect(mockBulkWrite).not.toHaveBeenCalled();
				});
		});

		it("should skip documents already claimed (bulkWrite modifiedCount < candidates)", () => {
			const cm = new DlqClaimManagerClass();
			const fakeDoc1 = {
				_id: { toHexString: () => "id1" },
				topic: "t1",
				message: { x: 1 },
				reason: null,
				deliveryAttempt: 1,
				createdAt: new Date("2024-01-01"),
			};
			const fakeDoc2 = {
				_id: { toHexString: () => "id2" },
				topic: "t2",
				message: { y: 2 },
				reason: null,
				deliveryAttempt: 1,
				createdAt: new Date("2024-01-02"),
			};
			const fakeDocs = [fakeDoc1, fakeDoc2];

			mockFind
				.mockReturnValueOnce(createCursor(fakeDocs))
				.mockReturnValueOnce(createCursor([fakeDoc2]));
			mockBulkWrite.mockResolvedValueOnce({ modifiedCount: 1 });

			return cm
				.claimEntriesForRetry({
					limit: 10,
					batchId: "batch-1",
					instanceId: "instance-1",
				})
				.then((result: Array<{ id: string }>) => {
					expect(result).toHaveLength(1);
					expect(result[0].id).toBe("id2");
				});
		});
	});
});

describe("DlqRetryManager", () => {
	let DlqRetryManagerClass: {
		new (): {
			markRetried: (...args: never[]) => Promise<void>;
			abandonExhaustedEntries: (...args: never[]) => Promise<number>;
		};
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/adapters/outbound/retry-manager");
		DlqRetryManagerClass = mod.DlqRetryManager;
	});

	describe("abandonExhaustedEntries", () => {
		it("should mark entries as abandoned", () => {
			const rm = new DlqRetryManagerClass();
			mockUpdateMany.mockResolvedValueOnce({ modifiedCount: 3 });

			return rm.abandonExhaustedEntries().then((result: number) => {
				expect(result).toBe(3);
				expect(mockUpdateMany).toHaveBeenCalledWith(
					{
						status: { $ne: "abandoned" },
						processingAt: { $exists: false },
						$or: [
							{ retryCount: { $gte: 3 } },
							{ consecutiveErrors: { $gte: 3 } },
						],
					},
					{
						$set: expect.objectContaining({
							status: "abandoned",
							abandonedAt: expect.any(Date),
						}),
					}
				);
			});
		});
	});

	describe("markRetried", () => {
		beforeEach(() => {
			mockFindOne.mockReset();
			mockFindOneAndUpdate.mockReset();
			mockUpdateOne.mockReset();
		});

		it("should set completed status on success without incrementing retryCount", () => {
			const rm = new DlqRetryManagerClass();
			mockFindOne.mockResolvedValue(null);
			mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });

			return rm
				.markRetried({
					id: "aaaaaaaaaaaaaaaaaaaaaaaa",
					instanceId: "instance-1",
					batchId: "batch-1",
					success: true,
				})
				.then(() => {
					expect(mockFindOne).toHaveBeenCalledWith(
						{ _id: expect.any(Object) },
						{ projection: { status: 1 } }
					);
					expect(mockUpdateOne).toHaveBeenCalledWith(
						{ _id: expect.any(Object), processingInstance: "instance-1" },
						{
							$set: expect.objectContaining({
								status: "completed",
								completedAt: expect.any(Date),
								lastBatchId: "batch-1",
							}),
							$unset: { processingAt: "", processingInstance: "" },
						}
					);
				});
		});

		it("should increment retryCount and set lastError on failure via aggregation pipeline", () => {
			const rm = new DlqRetryManagerClass();
			mockFindOneAndUpdate.mockResolvedValue({ _id: "id1" });

			return rm
				.markRetried({
					id: "aaaaaaaaaaaaaaaaaaaaaaaa",
					instanceId: "instance-1",
					batchId: "batch-1",
					success: false,
				})
				.then(() => {
					expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
						{ _id: expect.any(Object), retryCount: { $lt: 3 } },
						expect.arrayContaining([
							expect.objectContaining({
								$set: expect.objectContaining({
									retryCount: { $add: ["$retryCount", 1] },
									lastError: "Replay failed",
								}),
							}),
						]),
						{ returnDocument: "after", projection: { _id: 1 } }
					);
					expect(mockUpdateOne).not.toHaveBeenCalled();
				});
		});

		it("should skip update on abandoned entry for success path", () => {
			const rm = new DlqRetryManagerClass();
			mockFindOne.mockResolvedValue({ _id: "id1", status: "abandoned" });

			return rm
				.markRetried({
					id: "aaaaaaaaaaaaaaaaaaaaaaaa",
					instanceId: "instance-1",
					batchId: "batch-1",
					success: true,
				})
				.then(() => {
					expect(mockFindOne).toHaveBeenCalled();
					expect(mockUpdateOne).not.toHaveBeenCalled();
				});
		});

		it("should release claim on failure when retryCount already at max", () => {
			const rm = new DlqRetryManagerClass();
			mockFindOneAndUpdate.mockResolvedValue(null);
			mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });

			return rm
				.markRetried({
					id: "aaaaaaaaaaaaaaaaaaaaaaaa",
					instanceId: "instance-1",
					batchId: "batch-1",
					success: false,
				})
				.then(() => {
					expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
					expect(mockUpdateOne).toHaveBeenCalledWith(
						{ _id: expect.any(Object) },
						{ $unset: { processingAt: "", processingInstance: "" } }
					);
				});
		});
	});
});
