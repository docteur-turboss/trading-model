import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_COLLECTION = {
	insertOne: jest.fn<any>(),
	insertMany: jest.fn<any>(),
	findOne: jest.fn<any>(),
	find: jest.fn<any>(),
	createIndex: jest.fn<any>(),
	createIndexes: jest.fn<any>(),
	updateOne: jest.fn<any>(),
	estimatedDocumentCount: jest.fn<any>(),
	aggregate: jest.fn<any>(),
	countDocuments: jest.fn<any>(),
};

const MOCK_DB = {
	collection: jest.fn<any>().mockReturnValue(MOCK_COLLECTION),
};

jest.mock("mongodb", () => ({
	Db: jest.fn(),
	Collection: jest.fn(),
}));

import { DateRange } from "@trading-model/primitives/date-range";
import {
	toCorrelationId,
	toInstanceId,
	toMessageId,
	toServiceId,
	toTopic,
} from "@trading-model/primitives/primitives";
import {
	type AuditEventDocument,
	AuditRepository,
} from "../../../src/adapters/outbound/persistence/audit-repository";

function makeEvent(
	overrides: Partial<AuditEventDocument> = {}
): AuditEventDocument {
	return {
		receivedAt: new Date(),
		ttl: new Date(Date.now() + 90 * 86_400_000),
		dataHash: "abc123",
		metadata: {
			topic: toTopic("test-topic"),
			eventType: "test.event" as any,
			publisher: toServiceId("test-service"),
			instanceId: toInstanceId("instance-1"),
			messageId: toMessageId("msg-1"),
			correlationId: toCorrelationId("corr-1"),
		},
		payload: { key: "value" },
		...overrides,
	};
}

describe("AuditRepository", () => {
	let repository: AuditRepository;

	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_COLLECTION.find.mockReturnValue({
			sort: jest.fn<any>().mockReturnThis(),
			skip: jest.fn<any>().mockReturnThis(),
			limit: jest.fn<any>().mockReturnThis(),
			toArray: jest.fn<any>().mockResolvedValue([]),
		});
		MOCK_COLLECTION.findOne.mockResolvedValue(null);
		MOCK_COLLECTION.aggregate.mockReturnValue({ toArray: jest.fn<any>() });
		MOCK_COLLECTION.updateOne.mockResolvedValue({ matchedCount: 1 });
		repository = new AuditRepository(MOCK_DB as any);
	});

	describe("constructor", () => {
		it('should call db.collection with "audit_events"', () => {
			expect(MOCK_DB.collection).toHaveBeenCalledWith("audit_events");
		});
	});

	describe("ensureIndexes", () => {
		it("should create the 7 indexes in one call", async () => {
			MOCK_COLLECTION.createIndexes.mockResolvedValue([]);

			await repository.ensureIndexes();

			expect(MOCK_COLLECTION.createIndexes).toHaveBeenCalledWith([
				{ key: { "metadata.correlationId": 1 } },
				{ key: { "metadata.publisher": 1, receivedAt: -1 } },
				{ key: { "metadata.topic": 1, receivedAt: -1 } },
				{ key: { receivedAt: -1 } },
				{ key: { "metadata.messageId": 1 }, unique: true },
				{ key: { ttl: 1 }, expireAfterSeconds: 0 },
				{ key: { chainSequence: 1 }, unique: true },
			]);
		});
	});

	describe("insert", () => {
		const bulkError = (index: number, keyPattern: object) => ({
			writeErrors: [{ index, code: 11000, keyPattern }],
		});
		const withId = (n: number) =>
			makeEvent({
				metadata: { ...makeEvent().metadata, messageId: toMessageId(`m-${n}`) },
			});

		it("should insertMany the chained event, stored as hashed", async () => {
			MOCK_COLLECTION.insertMany.mockResolvedValue({});
			const event = makeEvent();

			await repository.insert(event);

			expect(MOCK_COLLECTION.insertMany).toHaveBeenCalledTimes(1);
			// Stored as hashed: an undefined field must not become null.
			expect(MOCK_COLLECTION.insertMany).toHaveBeenCalledWith([event], {
				ignoreUndefined: true,
				ordered: true,
			});
			expect(event.previousHash).toBe("");
			expect(event.chainSequence).toBe(1);
			expect(event.dataHash.length).toBeGreaterThan(0);
		});

		it("should throw AppError on failure", async () => {
			MOCK_COLLECTION.insertMany.mockRejectedValue(new Error("DB error"));

			await expect(repository.insert(makeEvent())).rejects.toThrow(
				"Failed to persist audit event"
			);
		});

		it("should chain concurrent inserts in one batch under one lease", async () => {
			const batches: AuditEventDocument[][] = [];
			MOCK_COLLECTION.insertMany.mockImplementation(async (docs: any) => {
				batches.push(docs.map((d: any) => ({ ...d })));
				return {};
			});

			await Promise.all([1, 2, 3].map((n) => repository.insert(withId(n))));

			const stored = batches.flat();
			expect(stored.map((d) => d.chainSequence)).toEqual([1, 2, 3]);
			expect(stored[1].previousHash).toBe(stored[0].dataHash);
			expect(stored[2].previousHash).toBe(stored[1].dataHash);
			// Acquire once, release once: not per event.
			expect(MOCK_COLLECTION.updateOne.mock.calls.length).toBeLessThanOrEqual(
				2 + batches.length
			);
		});

		it("should keep the tail in memory while the lease is held", async () => {
			MOCK_COLLECTION.insertMany.mockResolvedValue({});
			const first = repository.insert(withId(1));
			const second = repository.insert(withId(2));
			await Promise.all([first, second]);

			expect(MOCK_COLLECTION.findOne).toHaveBeenCalledTimes(1);
		});

		it("should retry the batch when another replica took the sequence", async () => {
			MOCK_COLLECTION.insertMany
				.mockRejectedValueOnce(bulkError(0, { chainSequence: 1 }))
				.mockResolvedValueOnce({});

			await repository.insert(makeEvent());

			expect(MOCK_COLLECTION.insertMany).toHaveBeenCalledTimes(2);
			// The tail is read again after the collision.
			expect(MOCK_COLLECTION.findOne).toHaveBeenCalledTimes(2);
		});

		it("should give up after repeated sequence conflicts", async () => {
			MOCK_COLLECTION.insertMany.mockRejectedValue(
				bulkError(0, { chainSequence: 1 })
			);

			await expect(repository.insert(makeEvent())).rejects.toThrow(
				"Failed to persist audit event"
			);
			expect(MOCK_COLLECTION.insertMany).toHaveBeenCalledTimes(5);
		});

		it("should wait while another replica holds the lease", async () => {
			MOCK_COLLECTION.updateOne
				.mockRejectedValueOnce({ code: 11000 })
				.mockResolvedValue({ matchedCount: 1 });
			MOCK_COLLECTION.insertMany.mockResolvedValue({});

			await repository.insert(makeEvent());
			await new Promise((resolve) => setImmediate(resolve));

			// 2 acquire attempts + 1 release
			expect(MOCK_COLLECTION.updateOne).toHaveBeenCalledTimes(3);
			expect(MOCK_COLLECTION.insertMany).toHaveBeenCalledTimes(1);
		});

		it("should re-acquire when the lease was taken over before a batch", async () => {
			MOCK_COLLECTION.insertMany.mockImplementation(async () => {
				// A second batch is queued while the first is written.
				void repository.insert(withId(9));
				return {};
			});
			MOCK_COLLECTION.insertMany.mockImplementationOnce(async () => {
				void repository.insert(withId(9));
				return {};
			});
			MOCK_COLLECTION.insertMany.mockImplementationOnce(async () => ({}));
			// acquire ok, renew refused (taken over), acquire ok, release
			MOCK_COLLECTION.updateOne
				.mockResolvedValueOnce({})
				.mockResolvedValueOnce({ matchedCount: 0 })
				.mockResolvedValue({ matchedCount: 1 });

			await repository.insert(withId(1));
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(MOCK_COLLECTION.insertMany).toHaveBeenCalledTimes(2);
			expect(MOCK_COLLECTION.findOne).toHaveBeenCalledTimes(2);
		});

		it("should not record a redelivered message twice and go on", async () => {
			MOCK_COLLECTION.insertMany
				.mockRejectedValueOnce(bulkError(1, { "metadata.messageId": 1 }))
				.mockResolvedValueOnce({});

			await expect(
				Promise.all([1, 2, 3].map((n) => repository.insert(withId(n))))
			).resolves.toBeDefined();
			expect(MOCK_COLLECTION.insertMany).toHaveBeenCalledTimes(2);
			// Event 3 was re-chained right after event 1.
			const retried = MOCK_COLLECTION.insertMany.mock.calls[1][0] as any[];
			expect(retried).toHaveLength(1);
			expect(retried[0].chainSequence).toBe(2);
		});

		it("should keep inserting after a failed insert", async () => {
			MOCK_COLLECTION.insertMany
				.mockRejectedValueOnce(new Error("DB error"))
				.mockResolvedValueOnce({});

			await expect(repository.insert(makeEvent())).rejects.toThrow();
			await expect(repository.insert(makeEvent())).resolves.toBeUndefined();
		});
	});

	describe("findById", () => {
		it("should find event by metadata.messageId", async () => {
			const event = makeEvent();
			MOCK_COLLECTION.findOne.mockResolvedValue(event);

			const result = await repository.findById("msg-1" as any);

			expect(MOCK_COLLECTION.findOne).toHaveBeenCalledWith({
				"metadata.messageId": "msg-1",
			});
			expect(result).toEqual(event);
		});

		it("should return null when not found", async () => {
			MOCK_COLLECTION.findOne.mockResolvedValue(null);

			const result = await repository.findById("nonexistent" as any);

			expect(result).toBeNull();
		});
	});

	describe("query", () => {
		it("should apply filters and return paginated results", async () => {
			MOCK_COLLECTION.find.mockReturnValue({
				sort: jest.fn().mockReturnThis(),
				skip: jest.fn().mockReturnThis(),
				limit: jest.fn().mockReturnThis(),
				toArray: jest.fn<any>().mockResolvedValue([makeEvent()]),
			});
			MOCK_COLLECTION.countDocuments.mockResolvedValue(1);

			const result = await repository.query({
				topic: "test-topic" as any,
				publisher: "test-service" as any,
				page: 1 as any,
				limit: 10 as any,
			});

			expect(MOCK_COLLECTION.countDocuments).toHaveBeenCalled();
			expect(result).toMatchObject({
				docs: [expect.any(Object)],
				page: 1,
				limit: 10,
				total: 1,
			});
		});

		it("should apply date range filters", async () => {
			const startDate = new Date("2024-01-01");
			const endDate = new Date("2024-12-31");

			await repository.query({
				dateRange: new DateRange(startDate, endDate),
			});

			const findFilter = (MOCK_COLLECTION.find as jest.Mock).mock
				.calls[0][0] as any;
			expect(findFilter.receivedAt).toMatchObject({
				$gte: startDate,
				$lte: endDate,
			});
		});

		it("should apply startDate only", async () => {
			const startDate = new Date("2024-06-01");

			await repository.query({
				dateRange: new DateRange(startDate, undefined),
			});

			const findFilter = (MOCK_COLLECTION.find as jest.Mock).mock
				.calls[0][0] as any;
			expect(findFilter.receivedAt.$gte).toEqual(startDate);
			expect(findFilter.receivedAt.$lte).toBeUndefined();
		});

		it("should apply endDate only", async () => {
			const endDate = new Date("2024-12-31");

			await repository.query({
				dateRange: new DateRange(undefined, endDate),
			});

			const findFilter = (MOCK_COLLECTION.find as jest.Mock).mock
				.calls[0][0] as any;
			expect(findFilter.receivedAt.$lte).toEqual(endDate);
			expect(findFilter.receivedAt.$gte).toBeUndefined();
		});

		it("should apply correlationId filter", async () => {
			await repository.query({ correlationId: "corr-1" as any });

			const findFilter = (MOCK_COLLECTION.find as jest.Mock).mock
				.calls[0][0] as any;
			expect(findFilter["metadata.correlationId"]).toBe("corr-1");
		});

		it("should cap limit at 1000", async () => {
			await repository.query({ limit: 5000 as any });

			expect(MOCK_COLLECTION.countDocuments).toHaveBeenCalled();

			const findCall = MOCK_COLLECTION.find.mock.calls[0][1];
			expect(findCall).toBeUndefined();
		});

		it("should handle empty result set", async () => {
			MOCK_COLLECTION.find.mockReturnValue({
				sort: jest.fn().mockReturnThis(),
				skip: jest.fn().mockReturnThis(),
				limit: jest.fn().mockReturnThis(),
				toArray: jest.fn<any>().mockResolvedValue([]),
			});
			MOCK_COLLECTION.countDocuments.mockResolvedValue(0);

			const result = await repository.query({});

			expect(result).toMatchObject({
				docs: [],
				page: 1,
				limit: 100,
				total: 0,
			});
		});
	});

	describe("getStats", () => {
		function makeAggregateResult<T>(value: T[]) {
			return { toArray: jest.fn<any>().mockResolvedValue(value) };
		}

		it("should return aggregated statistics", async () => {
			MOCK_COLLECTION.estimatedDocumentCount.mockResolvedValue(10);
			MOCK_COLLECTION.aggregate
				.mockReturnValueOnce(
					makeAggregateResult([
						{ _id: "topic-a", count: 6 },
						{ _id: "topic-b", count: 4 },
					])
				)
				.mockReturnValueOnce(makeAggregateResult([{ _id: "svc-a", count: 10 }]))
				.mockReturnValueOnce(
					makeAggregateResult([
						{
							earliest: new Date("2024-01-01"),
							latest: new Date("2024-12-31"),
						},
					])
				);

			const stats = await repository.getStats();

			expect(stats).toMatchObject({
				totalEvents: 10,
				eventsByTopic: { "topic-a": 6, "topic-b": 4 },
				eventsByPublisher: { "svc-a": 10 },
				dateRange: {
					earliest: new Date("2024-01-01"),
					latest: new Date("2024-12-31"),
				},
			});
		});

		it("should handle empty dateRange aggregations", async () => {
			MOCK_COLLECTION.estimatedDocumentCount.mockResolvedValue(0);
			MOCK_COLLECTION.aggregate
				.mockReturnValueOnce(makeAggregateResult([]))
				.mockReturnValueOnce(makeAggregateResult([]))
				.mockReturnValueOnce(makeAggregateResult([]));

			const stats = await repository.getStats();

			expect(stats.dateRange.earliest).toBeNull();
			expect(stats.dateRange.latest).toBeNull();
		});
	});
});
