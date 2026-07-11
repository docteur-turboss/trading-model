import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const _mockConnect = jest.fn().mockResolvedValue(undefined);
const mockGetConnection = jest.fn().mockResolvedValue({
	db: jest.fn(() => ({ databaseName: "test-db" })),
	close: jest.fn().mockResolvedValue(undefined),
});
const mockClose = jest.fn().mockResolvedValue(undefined);

const mockMongoConnectionManager = {
	getConnection: mockGetConnection,
	isConnected: () => true,
	getClient: () => ({ db: () => ({ databaseName: "test-db" }) }),
	getDb: () => ({ databaseName: "test-db" }),
	close: mockClose,
	resetState: jest.fn().mockResolvedValue(undefined),
	poolSize: 50,
};

jest.mock("@trading-model/common/persistence/mongo-connection-manager", () => ({
	MongoConnectionManager: jest
		.fn()
		.mockImplementation(() => mockMongoConnectionManager),
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
		expect(mockGetConnection).toHaveBeenCalled();
	});

	it("should not re-initialize if already initialized", async () => {
		await MONGO_MANAGER.initialize(TEST_URI);
		await MONGO_MANAGER.initialize(TEST_URI);
		expect(mockGetConnection).toHaveBeenCalledTimes(1);
	});

	it("should return isConnected true after init", async () => {
		expect(MONGO_MANAGER.isConnected()).toBe(false);
		await MONGO_MANAGER.initialize(TEST_URI);
		expect(MONGO_MANAGER.isConnected()).toBe(true);
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
		const db = await MONGO_MANAGER.getDb();
		expect(db).toBeDefined();
	});

	it("should throw getDb before init", () => {
		expect(() => MONGO_MANAGER.getDb()).toThrow("not initialized");
	});

	it("should return pool size", async () => {
		await MONGO_MANAGER.initialize(TEST_URI);
		expect(MONGO_MANAGER.poolSize).toBeGreaterThan(0);
	});

	it("should try reconnect on failure", async () => {
		await MONGO_MANAGER.initialize(TEST_URI);
		const result = await MONGO_MANAGER.tryReconnect();
		expect(result).toBe(true);
	});

	it("should close and reset state", async () => {
		await MONGO_MANAGER.initialize(TEST_URI);
		await MONGO_MANAGER.close();
		expect(mockClose).toHaveBeenCalled();
		expect(MONGO_MANAGER.isConnected()).toBe(false);
	});

	it("should handle close when not initialized", async () => {
		await MONGO_MANAGER.close();
		expect(mockClose).not.toHaveBeenCalled();
	});
});
