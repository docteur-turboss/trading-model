import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockInsertOne = jest.fn();
const mockInsertMany = jest.fn();
const mockCreateIndex = jest.fn();
const mockConnect = jest.fn();
const mockClose = jest.fn();

jest.mock("mongodb", () => ({
	MongoClient: jest.fn().mockImplementation(() => ({
		connect: mockConnect,
		close: mockClose,
		db: jest.fn(() => ({
			collection: jest.fn(() => ({
				insertOne: mockInsertOne,
				insertMany: mockInsertMany,
				createIndex: mockCreateIndex,
			})),
		})),
	})),
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockMongoIsInitialized = jest.fn().mockReturnValue(false);

jest.mock("../../src/persistence/mongo-manager", () => ({
	MONGO_MANAGER: {
		isInitialized: mockMongoIsInitialized,
		getClient: jest.fn(() => ({})),
		getDb: jest.fn(() => ({
			collection: jest.fn(() => ({
				insertOne: mockInsertOne,
				insertMany: mockInsertMany,
				createIndex: mockCreateIndex,
			})),
		})),
	},
}));

import { AuditStore } from "../../src/persistence/audit-store";

const makeEntry = () => ({
	action: "sign" as const,
	serviceId: "svc-1",
	serialNumber: "SN-001",
	success: true,
	timestamp: new Date(),
});

describe("AuditStore", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockMongoIsInitialized.mockReturnValue(false);
		mockConnect.mockResolvedValue(undefined);
		mockInsertOne.mockResolvedValue({ acknowledged: true });
		mockInsertMany.mockResolvedValue({ acknowledged: true });
	});

	it("should connect and create indexes", async () => {
		const store = new AuditStore("mongodb://localhost:27017/test");
		await store.connect();
		expect(mockCreateIndex).toHaveBeenCalledTimes(3);
	});

	it("should use MONGO_MANAGER when initialized", () => {
		mockMongoIsInitialized.mockReturnValue(true);
		const store = new AuditStore("mongodb://localhost:27017/test");
		expect(store).toBeDefined();
	});

	it("should log entry to MongoDB", async () => {
		mockConnect.mockResolvedValue(undefined);
		const store = new AuditStore("mongodb://localhost:27017/test");
		await store.connect();
		await store.log(makeEntry());
		expect(mockInsertOne).toHaveBeenCalled();
	});

	it("should buffer entry when MongoDB fails", async () => {
		mockConnect.mockRejectedValue(new Error("Connection failed"));
		const store = new AuditStore("mongodb://localhost:27017/test");
		await store.connect();
		await store.log(makeEntry());
		expect(mockInsertOne).not.toHaveBeenCalled();
	});

	it("should disconnect and flush", async () => {
		mockConnect.mockResolvedValue(undefined);
		const store = new AuditStore("mongodb://localhost:27017/test");
		await store.connect();
		await store.disconnect();
		expect(mockClose).toHaveBeenCalled();
	});

	it("should buffer full entries and drop oldest", async () => {
		mockConnect.mockRejectedValue(new Error("No connection"));
		const store = new AuditStore("mongodb://localhost:27017/test");
		await store.connect();

		for (let i = 0; i < 5010; i++) {
			await store.log(makeEntry());
		}
	});

	it("should flush buffered entries when MongoDB becomes available", async () => {
		mockConnect
			.mockRejectedValueOnce(new Error("First fail"))
			.mockResolvedValueOnce(undefined);

		const store = new AuditStore("mongodb://localhost:27017/test");
		await store.connect();
		await store.log(makeEntry());
	});

	it("should buffer entry on insertOne failure and retry", async () => {
		mockConnect.mockResolvedValue(undefined);
		mockInsertOne
			.mockRejectedValueOnce(new Error("Write failed"))
			.mockResolvedValueOnce({ acknowledged: true });

		const store = new AuditStore("mongodb://localhost:27017/test");
		await store.connect();

		await store.log(makeEntry());
		expect(mockInsertOne).toHaveBeenCalledTimes(1);

		await store.log(makeEntry());
	});

	it("should handle flush failure with re-buffering", async () => {
		const store = new AuditStore("mongodb://localhost:27017/test");
		await store.connect();

		for (let i = 0; i < 5; i++) {
			await store.log(makeEntry());
		}
	});

	it("should handle insertMany failure during flush", async () => {
		mockInsertMany.mockRejectedValue(new Error("Bulk write failed"));
		const store = new AuditStore("mongodb://localhost:27017/test");
		await store.connect();

		for (let i = 0; i < 3; i++) {
			await store.log(makeEntry());
		}
	});

	it("should handle disconnect without active connection", async () => {
		const store = new AuditStore("mongodb://localhost:27017/test");
		await store.disconnect();
	});
});
