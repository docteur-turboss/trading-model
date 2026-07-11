import { describe, expect, it, jest } from "@jest/globals";

const MOCK_GET_DB = jest.fn();
const MOCK_IS_CONNECTED = jest.fn();
const MOCK_RESET_STATE_SUPER = jest.fn();
const MOCK_CLOSE_SUPER = jest.fn();
const MOCK_CLEAR_STATE_SUPER = jest.fn();
const MOCK_CREATE_COLLECTION_INDEXES = jest.fn();

jest.mock("../../src/config/env", () => ({
	ENV: {
		MONGO_URI: "mongodb://localhost:27017/test",
		MONGO_DB: "test_db",
		MONGO_COLLECTION: "test_collection",
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/config/index-manager", () => ({
	IndexManager: jest.fn(() => ({
		createCollectionIndexes: MOCK_CREATE_COLLECTION_INDEXES,
	})),
}));

jest.mock("@trading-model/common/persistence/mongo-connection-manager", () => {
	class MockCommonMongoConnectionManager {
		getDb() {
			return MOCK_GET_DB();
		}
		isConnected() {
			return MOCK_IS_CONNECTED();
		}
		async resetState() {
			return MOCK_RESET_STATE_SUPER();
		}
		async close() {
			return MOCK_CLOSE_SUPER();
		}
		_clearState() {
			MOCK_CLEAR_STATE_SUPER();
		}
	}
	return { MongoConnectionManager: MockCommonMongoConnectionManager };
});

describe("MongoConnectionManager", () => {
	let MongoConnectionManagerClass: new () => {
		getCollection: () => Promise<unknown>;
		getDb: () => Promise<unknown>;
		isConnected: () => boolean;
		getMissingCriticalIndexes: () => string[];
		resetState: () => Promise<void>;
		close: () => Promise<void>;
	};

	beforeAll(() => {
		const mod = jest.requireActual(
			"../../src/config/mongo-connection-manager"
		) as {
			MongoConnectionManager: typeof MongoConnectionManagerClass;
		};
		MongoConnectionManagerClass = mod.MongoConnectionManager;
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return collection via getCollection on first call", async () => {
		const mockCollection = { collectionName: "test" };
		const mockDb = {
			collection: jest.fn().mockReturnValue(mockCollection),
		};
		MOCK_GET_DB.mockResolvedValue(mockDb as never);
		MOCK_CREATE_COLLECTION_INDEXES.mockResolvedValue([]);

		const manager = new MongoConnectionManagerClass();
		const result = await manager.getCollection();

		expect(result).toBe(mockCollection);
		expect(mockDb.collection).toHaveBeenCalledWith("test_collection");
		expect(MOCK_CREATE_COLLECTION_INDEXES).toHaveBeenCalled();
	});

	it("should return cached collection on subsequent calls", async () => {
		const mockCollection = { collectionName: "test" };
		const mockDb = {
			collection: jest.fn().mockReturnValue(mockCollection),
		};
		MOCK_GET_DB.mockResolvedValue(mockDb as never);
		MOCK_CREATE_COLLECTION_INDEXES.mockResolvedValue([]);

		const manager = new MongoConnectionManagerClass();
		const first = await manager.getCollection();
		const second = await manager.getCollection();

		expect(first).toBe(second);
		expect(mockDb.collection).toHaveBeenCalledTimes(1);
	});

	it("should return existing collection from in-flight promise", async () => {
		const mockCollection = { collectionName: "test" };
		const mockDb = {
			collection: jest.fn().mockReturnValue(mockCollection),
		};
		MOCK_GET_DB.mockResolvedValue(mockDb as never);
		MOCK_CREATE_COLLECTION_INDEXES.mockResolvedValue([]);

		const manager = new MongoConnectionManagerClass();
		const results = await Promise.all([
			manager.getCollection(),
			manager.getCollection(),
		]);

		expect(results[0]).toBe(results[1]);
		expect(mockDb.collection).toHaveBeenCalledTimes(1);
	});

	it("should return missing critical indexes", () => {
		MOCK_CREATE_COLLECTION_INDEXES.mockResolvedValue(["index1"]);

		const manager = new MongoConnectionManagerClass();
		expect(manager.getMissingCriticalIndexes()).toEqual([]);
	});

	it("should get missing critical indexes after initialization", async () => {
		const mockCollection = { collectionName: "test" };
		const mockDb = {
			collection: jest.fn().mockReturnValue(mockCollection),
		};
		MOCK_GET_DB.mockResolvedValue(mockDb as never);
		MOCK_CREATE_COLLECTION_INDEXES.mockResolvedValue(["missing-idx-1"]);

		const manager = new MongoConnectionManagerClass();
		await manager.getCollection();

		expect(manager.getMissingCriticalIndexes()).toEqual(["missing-idx-1"]);
	});

	it("should clear state on resetState", async () => {
		const mockCollection = { collectionName: "test" };
		const mockDb = {
			collection: jest.fn().mockReturnValue(mockCollection),
		};
		MOCK_GET_DB.mockResolvedValue(mockDb as never);
		MOCK_CREATE_COLLECTION_INDEXES.mockResolvedValue([]);
		MOCK_RESET_STATE_SUPER.mockResolvedValue(undefined as never);

		const manager = new MongoConnectionManagerClass();
		await manager.getCollection();
		await manager.resetState();

		expect(MOCK_RESET_STATE_SUPER).toHaveBeenCalled();
		expect(MOCK_CLEAR_STATE_SUPER).toHaveBeenCalled();
	});

	it("should clear state on close", async () => {
		const mockCollection = { collectionName: "test" };
		const mockDb = {
			collection: jest.fn().mockReturnValue(mockCollection),
		};
		MOCK_GET_DB.mockResolvedValue(mockDb as never);
		MOCK_CREATE_COLLECTION_INDEXES.mockResolvedValue([]);
		MOCK_CLOSE_SUPER.mockResolvedValue(undefined as never);

		const manager = new MongoConnectionManagerClass();
		await manager.getCollection();
		await manager.close();

		expect(MOCK_CLOSE_SUPER).toHaveBeenCalled();
		expect(MOCK_CLEAR_STATE_SUPER).toHaveBeenCalled();
	});
});
