import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockInsertOne = jest.fn();
const mockFindOneAndDelete = jest.fn();
const mockCreateIndex = jest.fn();
const mockFind = jest.fn();
const mockToArray = jest.fn();

jest.mock("mongodb", () => ({
	MongoClient: jest.fn().mockImplementation(() => ({
		connect: jest.fn().mockResolvedValue(undefined),
		db: jest.fn(() => ({
			collection: jest.fn(() => ({
				insertOne: mockInsertOne,
				findOneAndDelete: mockFindOneAndDelete,
				createIndex: mockCreateIndex,
				find: mockFind,
			})),
		})),
		close: jest.fn().mockResolvedValue(undefined),
	})),
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockMongoIsInitialized = jest.fn().mockReturnValue(false);
const mockMongoGetDb = jest.fn();

jest.mock("../../src/persistence/mongo-manager", () => ({
	MONGO_MANAGER: {
		isInitialized: mockMongoIsInitialized,
		getDb: mockMongoGetDb,
	},
}));

import { NonceStore } from "../../src/persistence/nonce-store";

describe("NonceStore", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockMongoIsInitialized.mockReturnValue(false);
		mockFind.mockReturnValue({ toArray: mockToArray });
		mockToArray.mockResolvedValue([]);
		mockFindOneAndDelete.mockResolvedValue(null);
	});

	it("should operate in memory-only mode without MongoDB URI", async () => {
		const store = new NonceStore();
		expect(store.size).toBe(0);
	});

	it("should generate nonce in memory-only mode", async () => {
		const store = new NonceStore();
		const nonce = await store.generate("svc-1");
		expect(nonce).toBeDefined();
		expect(nonce.length).toBe(64);
		expect(store.size).toBe(1);
	});

	it("should consume nonce in memory-only mode", async () => {
		const store = new NonceStore();
		const nonce = await store.generate("svc-1");
		const result = await store.consume(nonce, "svc-1");
		expect(result).toBe(true);
		expect(store.size).toBe(0);
	});

	it("should return false for unknown nonce", async () => {
		const store = new NonceStore();
		const result = await store.consume("unknown", "svc-1");
		expect(result).toBe(false);
	});

	it("should return false for mismatched serviceId", async () => {
		const store = new NonceStore();
		const nonce = await store.generate("svc-1");
		const result = await store.consume(nonce, "svc-2");
		expect(result).toBe(false);
	});

	it("should return false for expired nonce", async () => {
		jest.useFakeTimers();
		const store = new NonceStore(100);
		const nonce = await store.generate("svc-1");
		jest.advanceTimersByTime(200);
		const result = await store.consume(nonce, "svc-1");
		expect(result).toBe(false);
		jest.useRealTimers();
	});

	it("should connect to MongoDB with MONGO_MANAGER", async () => {
		mockMongoIsInitialized.mockReturnValue(true);
		mockMongoGetDb.mockReturnValue({
			collection: jest.fn(() => ({
				insertOne: mockInsertOne,
				findOneAndDelete: mockFindOneAndDelete,
				createIndex: mockCreateIndex,
				find: mockFind,
			})),
		});

		const store = new NonceStore(300000, "mongodb://localhost:27017/test");
		await store.connect();
		expect(mockCreateIndex).toHaveBeenCalledTimes(2);
	});

	it("should generate and persist nonce to MongoDB", async () => {
		mockMongoIsInitialized.mockReturnValue(true);
		mockMongoGetDb.mockReturnValue({
			collection: jest.fn(() => ({
				insertOne: mockInsertOne,
				findOneAndDelete: mockFindOneAndDelete,
				createIndex: mockCreateIndex,
				find: mockFind,
			})),
		});
		mockInsertOne.mockResolvedValue({ acknowledged: true });

		const store = new NonceStore(300000, "mongodb://localhost:27017/test");
		await store.connect();
		const nonce = await store.generate("svc-1");
		expect(mockInsertOne).toHaveBeenCalled();
		expect(nonce).toBeDefined();
	});

	it("should consume nonce via MongoDB", async () => {
		mockMongoIsInitialized.mockReturnValue(true);
		mockMongoGetDb.mockReturnValue({
			collection: jest.fn(() => ({
				insertOne: mockInsertOne,
				findOneAndDelete: mockFindOneAndDelete,
				createIndex: mockCreateIndex,
				find: mockFind,
			})),
		});
		mockFindOneAndDelete.mockResolvedValue({
			nonce: "test-nonce",
			serviceId: "svc-1",
			createdAt: new Date(),
		});

		const store = new NonceStore(300000, "mongodb://localhost:27017/test");
		await store.connect();
		const result = await store.consume("test-nonce", "svc-1");
		expect(result).toBe(true);
	});

	it("should return false when MongoDB findOneAndDelete returns null", async () => {
		mockMongoIsInitialized.mockReturnValue(true);
		mockMongoGetDb.mockReturnValue({
			collection: jest.fn(() => ({
				insertOne: mockInsertOne,
				findOneAndDelete: mockFindOneAndDelete,
				createIndex: mockCreateIndex,
				find: mockFind,
			})),
		});
		mockFindOneAndDelete.mockResolvedValue(null);

		const store = new NonceStore(300000, "mongodb://localhost:27017/test");
		await store.connect();
		const result = await store.consume("test-nonce", "svc-1");
		expect(result).toBe(false);
	});

	it("should disconnect properly", () => {
		const store = new NonceStore();
		store.disconnect();
		expect(store.size).toBe(0);
	});

	it("should handle failed MongoDB connection gracefully", async () => {
		mockMongoIsInitialized.mockReturnValue(true);
		mockMongoGetDb.mockImplementation(() => {
			throw new Error("Connection error");
		});

		const store = new NonceStore(300000, "mongodb://localhost:27017/test");
		await store.connect();
	});
});
