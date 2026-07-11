import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_COLLECTION = {
	insertOne: jest.fn<any>(),
	insertMany: jest.fn<any>(),
	findOne: jest.fn<any>(),
	find: jest.fn<any>(),
	createIndex: jest.fn<any>(),
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

import { DateRange } from "@trading-model/common/domain/date-range";
import {
	toCorrelationId,
	toInstanceId,
	toMessageId,
	toServiceId,
	toTopic,
} from "@trading-model/common/domain/primitives";
import {
	type AuditEventDocument,
	AuditRepository,
} from "../../../src/persistence/audit-repository";

function makeEvent(
	overrides: Partial<AuditEventDocument> = {}
): AuditEventDocument {
	return {
		receivedAt: new Date(),
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
			toArray: jest.fn<any>(),
		});
		MOCK_COLLECTION.aggregate.mockReturnValue({ toArray: jest.fn<any>() });
		repository = new AuditRepository(MOCK_DB as any);
	});

	describe("constructor", () => {
		it('should call db.collection with "audit_events"', () => {
			expect(MOCK_DB.collection).toHaveBeenCalledWith("audit_events");
		});
	});

	describe("ensureIndexes", () => {
		it("should create 4 indexes", async () => {
			MOCK_COLLECTION.createIndex.mockResolvedValue(undefined);

			await repository.ensureIndexes();

			expect(MOCK_COLLECTION.createIndex).toHaveBeenCalledTimes(4);
			expect(MOCK_COLLECTION.createIndex).toHaveBeenCalledWith({
				"metadata.correlationId": 1,
			});
			expect(MOCK_COLLECTION.createIndex).toHaveBeenCalledWith({
				"metadata.publisher": 1,
				receivedAt: -1,
			});
			expect(MOCK_COLLECTION.createIndex).toHaveBeenCalledWith({
				"metadata.topic": 1,
				receivedAt: -1,
			});
			expect(MOCK_COLLECTION.createIndex).toHaveBeenCalledWith({
				receivedAt: -1,
			});
		});
	});

	describe("insert", () => {
		it("should call insertOne with the event document", async () => {
			MOCK_COLLECTION.insertOne.mockResolvedValue({ insertedId: "id" });
			const event = makeEvent();

			await repository.insert(event);

			expect(MOCK_COLLECTION.insertOne).toHaveBeenCalledTimes(1);
			expect(MOCK_COLLECTION.insertOne).toHaveBeenCalledWith(event);
		});

		it("should throw AppError on failure", async () => {
			MOCK_COLLECTION.insertOne.mockRejectedValue(new Error("DB error"));

			await expect(repository.insert(makeEvent())).rejects.toThrow(
				"Failed to persist audit event"
			);
		});
	});

	describe("insertBatch", () => {
		it("should call insertMany with the events", async () => {
			MOCK_COLLECTION.insertMany.mockResolvedValue({ insertedCount: 2 });
			const events = [
				makeEvent({
					metadata: {
						...makeEvent().metadata,
						messageId: toMessageId("msg-1"),
					},
				}),
				makeEvent({
					metadata: {
						...makeEvent().metadata,
						messageId: toMessageId("msg-2"),
					},
				}),
			];

			await repository.insertBatch(events);

			expect(MOCK_COLLECTION.insertMany).toHaveBeenCalledWith(events, {
				ordered: false,
			});
		});

		it("should not call insertMany for empty array", async () => {
			await repository.insertBatch([]);

			expect(MOCK_COLLECTION.insertMany).not.toHaveBeenCalled();
		});

		it("should throw AppError on failure", async () => {
			MOCK_COLLECTION.insertMany.mockRejectedValue(new Error("DB error"));

			await expect(repository.insertBatch([makeEvent()])).rejects.toThrow(
				"Failed to persist audit event batch"
			);
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
