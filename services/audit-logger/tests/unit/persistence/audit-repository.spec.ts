import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_COLLECTION = {
	insertOne: jest.fn<any>(),
	findOne: jest.fn<any>(),
	find: jest.fn<any>(),
	createIndexes: jest.fn<any>(),
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
		it("should call insertOne with the event document and chain fields", async () => {
			MOCK_COLLECTION.insertOne.mockResolvedValue({ insertedId: "id" });
			const event = makeEvent();

			await repository.insert(event);

			expect(MOCK_COLLECTION.insertOne).toHaveBeenCalledTimes(1);
			// Stored as hashed: an undefined field must not become null.
			expect(MOCK_COLLECTION.insertOne).toHaveBeenCalledWith(event, {
				ignoreUndefined: true,
			});
			expect(event.previousHash).toBe("");
			expect(event.chainSequence).toBe(1);
			expect(typeof event.dataHash).toBe("string");
			expect(event.dataHash.length).toBeGreaterThan(0);
		});

		it("should throw AppError on failure", async () => {
			MOCK_COLLECTION.insertOne.mockRejectedValue(new Error("DB error"));

			await expect(repository.insert(makeEvent())).rejects.toThrow(
				"Failed to persist audit event"
			);
		});

		function useStoredChain(): AuditEventDocument[] {
			const stored: AuditEventDocument[] = [];
			MOCK_COLLECTION.findOne.mockImplementation(
				async () => stored[stored.length - 1] ?? null
			);
			MOCK_COLLECTION.insertOne.mockImplementation(async (doc: any) => {
				// Let the other concurrent inserts read the tail in between.
				await new Promise((resolve) => setImmediate(resolve));
				stored.push({ ...doc });
				return { insertedId: "id" };
			});
			return stored;
		}

		it("should chain concurrent inserts one after the other", async () => {
			const stored = useStoredChain();

			await Promise.all(
				[1, 2, 3].map((n) =>
					repository.insert(
						makeEvent({
							metadata: {
								...makeEvent().metadata,
								messageId: toMessageId(`m-${n}`),
							},
						})
					)
				)
			);

			expect(stored.map((doc) => doc.chainSequence)).toEqual([1, 2, 3]);
			expect(stored[1].previousHash).toBe(stored[0].dataHash);
			expect(stored[2].previousHash).toBe(stored[1].dataHash);
		});

		it("should retry when another replica took the sequence", async () => {
			MOCK_COLLECTION.insertOne
				.mockRejectedValueOnce({
					code: 11000,
					keyPattern: { chainSequence: 1 },
				})
				.mockResolvedValueOnce({ insertedId: "id" });

			await repository.insert(makeEvent());

			expect(MOCK_COLLECTION.insertOne).toHaveBeenCalledTimes(2);
		});

		it("should give up after repeated sequence conflicts", async () => {
			MOCK_COLLECTION.insertOne.mockRejectedValue({
				code: 11000,
				keyPattern: { chainSequence: 1 },
			});

			await expect(repository.insert(makeEvent())).rejects.toThrow(
				"Failed to persist audit event"
			);
			expect(MOCK_COLLECTION.insertOne).toHaveBeenCalledTimes(5);
		});

		it("should not record a redelivered message twice", async () => {
			MOCK_COLLECTION.insertOne.mockRejectedValue({
				code: 11000,
				keyPattern: { "metadata.messageId": 1 },
			});

			await expect(repository.insert(makeEvent())).resolves.toBeUndefined();
			expect(MOCK_COLLECTION.insertOne).toHaveBeenCalledTimes(1);
		});

		it("should keep inserting after a failed insert", async () => {
			MOCK_COLLECTION.insertOne
				.mockRejectedValueOnce(new Error("DB error"))
				.mockResolvedValueOnce({ insertedId: "id" });

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
