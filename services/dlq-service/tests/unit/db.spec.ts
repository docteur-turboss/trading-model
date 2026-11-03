import { describe, expect, it, jest } from "@jest/globals";

const MOCK_GET_DB = jest.fn();
const MOCK_GET_COLLECTION = jest.fn();
const MOCK_IS_CONNECTED = jest.fn();
const MOCK_GET_MISSING_INDEXES = jest.fn();
const MOCK_RESET_STATE = jest.fn();
const MOCK_CLOSE = jest.fn();

jest.mock("../../src/config/mongo-connection-manager", () => ({
	MongoConnectionManager: jest.fn(() => ({
		getDb: MOCK_GET_DB,
		getCollection: MOCK_GET_COLLECTION,
		isConnected: MOCK_IS_CONNECTED,
		getMissingCriticalIndexes: MOCK_GET_MISSING_INDEXES,
		resetState: MOCK_RESET_STATE,
		close: MOCK_CLOSE,
	})),
}));

describe("db", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should export getDb which delegates to MongoConnectionManager", async () => {
		const { getDb } = jest.requireActual("../../src/config/db") as {
			getDb: () => Promise<unknown>;
		};
		MOCK_GET_DB.mockResolvedValue({} as never);
		const result = await getDb();
		expect(MOCK_GET_DB).toHaveBeenCalled();
		expect(result).toEqual({});
	});

	it("should export getCollection which delegates to MongoConnectionManager", async () => {
		const { getCollection } = jest.requireActual("../../src/config/db") as {
			getCollection: () => Promise<unknown>;
		};
		MOCK_GET_COLLECTION.mockResolvedValue({} as never);
		const result = await getCollection();
		expect(MOCK_GET_COLLECTION).toHaveBeenCalled();
		expect(result).toEqual({});
	});

	it("should export isDbConnected which delegates to MongoConnectionManager", () => {
		const { isDbConnected } = jest.requireActual("../../src/config/db") as {
			isDbConnected: () => boolean;
		};
		MOCK_IS_CONNECTED.mockReturnValue(true as never);
		expect(isDbConnected()).toBe(true);
		expect(MOCK_IS_CONNECTED).toHaveBeenCalled();
	});

	it("should export getMissingCriticalIndexes which delegates to MongoConnectionManager", () => {
		const { getMissingCriticalIndexes } = jest.requireActual(
			"../../src/config/db"
		) as { getMissingCriticalIndexes: () => string[] };
		MOCK_GET_MISSING_INDEXES.mockReturnValue(["index1"] as never);
		expect(getMissingCriticalIndexes()).toEqual(["index1"]);
		expect(MOCK_GET_MISSING_INDEXES).toHaveBeenCalled();
	});

	it("should export resetDbState which delegates to MongoConnectionManager", async () => {
		const { resetDbState } = jest.requireActual("../../src/config/db") as {
			resetDbState: () => Promise<void>;
		};
		MOCK_RESET_STATE.mockResolvedValue(undefined as never);
		await resetDbState();
		expect(MOCK_RESET_STATE).toHaveBeenCalled();
	});

	it("should export closeDb which delegates to MongoConnectionManager", async () => {
		const { closeDb } = jest.requireActual("../../src/config/db") as {
			closeDb: () => Promise<void>;
		};
		MOCK_CLOSE.mockResolvedValue(undefined as never);
		await closeDb();
		expect(MOCK_CLOSE).toHaveBeenCalled();
	});
});
