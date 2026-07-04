import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockDb = jest.fn(() => ({ databaseName: "test-db" }));

jest.mock("mongodb", () => ({
	MongoClient: jest.fn().mockImplementation(() => ({
		connect: mockConnect,
		close: mockClose,
		db: mockDb,
	})),
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("MONGO_MANAGER", () => {
	const TEST_URI = "mongodb://localhost:27017/test";

	let MONGO_MANAGER: typeof import("../../src/persistence/mongo-manager")["MONGO_MANAGER"];

	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
		const mod =
			require("../../src/persistence/mongo-manager") as typeof import("../../src/persistence/mongo-manager");
		MONGO_MANAGER = mod.MONGO_MANAGER;
	});

	it("should initialize and connect", async () => {
		await MONGO_MANAGER.initialize(TEST_URI);
		expect(mockConnect).toHaveBeenCalled();
	});

	it("should not re-initialize if already initialized", async () => {
		await MONGO_MANAGER.initialize(TEST_URI);
		await MONGO_MANAGER.initialize(TEST_URI);
		expect(mockConnect).toHaveBeenCalledTimes(1);
	});

	it("should return isInitialized true after init", async () => {
		expect(MONGO_MANAGER.isInitialized()).toBe(false);
		await MONGO_MANAGER.initialize(TEST_URI);
		expect(MONGO_MANAGER.isInitialized()).toBe(true);
	});

	it("should return client after init", async () => {
		await MONGO_MANAGER.initialize(TEST_URI);
		const client = MONGO_MANAGER.getClient();
		expect(client).toBeDefined();
	});

	it("should throw getClient before init", () => {
		expect(() => MONGO_MANAGER.getClient()).toThrow("not initialized");
	});

	it("should return db after init", async () => {
		await MONGO_MANAGER.initialize(TEST_URI);
		const db = MONGO_MANAGER.getDb();
		expect(db).toBeDefined();
	});

	it("should throw getDb before init", () => {
		expect(() => MONGO_MANAGER.getDb()).toThrow("not initialized");
	});

	it("should return pool size", async () => {
		await MONGO_MANAGER.initialize(TEST_URI, 25);
		expect(MONGO_MANAGER.getPoolSize()).toBe(25);
	});

	it("should try reconnect on failure", async () => {
		mockClose.mockResolvedValueOnce(undefined);
		await MONGO_MANAGER.initialize(TEST_URI);
		const result = await MONGO_MANAGER.tryReconnect();
		expect(result).toBe(true);
		expect(mockConnect).toHaveBeenCalledTimes(2);
	});

	it("should close and reset state", async () => {
		await MONGO_MANAGER.initialize(TEST_URI);
		await MONGO_MANAGER.close();
		expect(mockClose).toHaveBeenCalled();
		expect(MONGO_MANAGER.isInitialized()).toBe(false);
	});

	it("should handle close when not initialized", async () => {
		await MONGO_MANAGER.close();
		expect(mockClose).not.toHaveBeenCalled();
	});
});
