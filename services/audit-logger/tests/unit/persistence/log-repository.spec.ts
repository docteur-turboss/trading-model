import { DateRange } from "@trading-model/common/domain/date-range";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockInsertOne = jest.fn<any>();
const mockInsertMany = jest.fn<any>();
const mockCreateIndex = jest.fn<any>();
const mockCountDocuments = jest.fn<any>();
const mockFind = jest.fn<any>();
const mockToArray = jest.fn<any>();
const mockAggregate = jest.fn<any>();
const mockFindOne = jest.fn<any>();
const mockIndexExists = jest.fn<any>();
const mockCollection = jest.fn<any>();

const mockObjectId = { toString: () => "507f1f77bcf86cd799439011" };
jest.mock("mongodb", () => ({
	ObjectId: Object.assign(jest.fn().mockReturnValue(mockObjectId), {
		isValid: jest.fn().mockReturnValue(true),
	}),
}));

const mockDb = {
	collection: mockCollection,
};

function setupCollection() {
	const col = {
		insertOne: mockInsertOne,
		insertMany: mockInsertMany,
		createIndex: mockCreateIndex,
		countDocuments: mockCountDocuments,
		find: mockFind,
		toArray: mockToArray,
		aggregate: mockAggregate,
		findOne: mockFindOne,
		indexExists: mockIndexExists,
	};
	mockFind.mockReturnValue({
		sort: jest.fn().mockReturnThis(),
		skip: jest.fn().mockReturnThis(),
		limit: jest.fn().mockReturnThis(),
		toArray: mockToArray,
	});
	mockAggregate.mockReturnValue({ toArray: mockToArray });
	mockCollection.mockReturnValue(col);
	jest.isolateModules;
}

import { LogRepository } from "../../../src/persistence/log-repository";

describe("LogRepository", () => {
	let repo: LogRepository;

	beforeEach(() => {
		jest.clearAllMocks();
		setupCollection();
		mockIndexExists.mockResolvedValue(false);
		repo = new LogRepository(mockDb as any);
	});

	it("should create indexes on first access", async () => {
		mockIndexExists.mockResolvedValue(false);
		await repo.ensureIndexes();
		expect(mockCreateIndex).toHaveBeenCalled();
	});

	it("should skip index creation if ttl index exists", async () => {
		mockIndexExists.mockResolvedValue(true);
		await repo.ensureIndexes();
		expect(mockCreateIndex).not.toHaveBeenCalled();
	});

	it("should insert a document", async () => {
		mockInsertOne.mockResolvedValue({ acknowledged: true });
		await repo.insert({
			receivedAt: new Date(),
			ttl: new Date(),
			level: "info",
			message: "test",
			service: { name: "svc", instanceId: "i1" },
		});
		expect(mockInsertOne).toHaveBeenCalled();
	});

	it("should insert batch", async () => {
		mockInsertMany.mockResolvedValue({ acknowledged: true });
		await repo.insertBatch([
			{
				receivedAt: new Date(),
				ttl: new Date(),
				level: "info",
				message: "test",
				service: { name: "svc", instanceId: "i1" },
			},
		]);
		expect(mockInsertMany).toHaveBeenCalled();
	});

	it("should skip empty batch", async () => {
		await repo.insertBatch([]);
		expect(mockInsertMany).not.toHaveBeenCalled();
	});

	it("should query with filters", async () => {
		mockCountDocuments.mockResolvedValue(1);
		mockToArray.mockResolvedValue([
			{
				receivedAt: new Date(),
				ttl: new Date(),
				level: "info",
				message: "test",
				service: { name: "svc", instanceId: "i1" },
			},
		]);

		const result = await repo.query({
			serviceName: "svc",
			level: "info",
			correlationId: "cid-1",
			dateRange: new DateRange(new Date("2024-01-01"), new Date("2024-12-31")),
			page: 1,
			limit: 10,
		});

		expect(result.docs).toHaveLength(1);
		expect(result.total).toBe(1);
	});

	it("should query with search", async () => {
		mockCountDocuments.mockResolvedValue(0);
		mockToArray.mockResolvedValue([]);

		const result = await repo.query({ search: "error" });
		expect(result.docs).toHaveLength(0);
	});

	it("should get stats", async () => {
		mockToArray.mockResolvedValue([
			{
				byService: [{ _id: "svc1", count: 10 }],
				byLevel: [{ _id: "info", count: 5 }],
				dateRange: [
					{ earliest: new Date("2024-01-01"), latest: new Date("2024-12-31") },
				],
				total: [{ count: 10 }],
			},
		]);

		const stats = await repo.getStats();
		expect(stats.total).toBe(10);
		expect(stats.byService.svc1).toBe(10);
		expect(stats.byLevel.info).toBe(5);
	});

	it("should get by id", async () => {
		mockFindOne.mockResolvedValue({
			receivedAt: new Date(),
			ttl: new Date(),
			level: "info",
			message: "test",
			service: { name: "svc", instanceId: "i1" },
		});

		const doc = await repo.getById("507f1f77bcf86cd799439011");
		expect(doc).not.toBeNull();
	});

	it("should return null for invalid ObjectId", async () => {
		const { ObjectId } = require("mongodb");
		ObjectId.isValid.mockReturnValue(false);

		const doc = await repo.getById("invalid-id");
		expect(doc).toBeNull();
	});
});
