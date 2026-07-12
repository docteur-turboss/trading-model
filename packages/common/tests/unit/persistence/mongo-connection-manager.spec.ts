import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { MongoClient } from "mongodb";
import { URLString } from "../../../src/domain/primitives";
import { MongoConnectionManager } from "../../../src/persistence/mongo-connection-manager";

interface MockClient {
	connect: jest.Mock<() => Promise<void>>;
	close: jest.Mock<() => Promise<void>>;
	db: jest.Mock<(name: string) => object>;
	on: jest.Mock<(event: string, handler: () => void) => void>;
	triggerEvent(event: string): void;
}

jest.mock("mongodb", () => ({
	MongoClient: jest.fn(),
}));

const MockMongoClient = MongoClient as unknown as jest.Mock;

let mockClient: MockClient;

function createMockClient(): MockClient {
	const eventHandlers: Record<string, () => void> = {};
	return {
		connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		db: jest.fn<(name: string) => object>().mockImplementation(() => ({})),
		on: jest
			.fn<(event: string, handler: () => void) => void>()
			.mockImplementation((event, handler) => {
				eventHandlers[event] = handler;
			}),
		triggerEvent(event: string) {
			eventHandlers[event]?.();
		},
	};
}

describe("MongoConnectionManager", () => {
	beforeEach(() => {
		mockClient = createMockClient();
		MockMongoClient.mockReturnValue(mockClient);
	});

	it("should expose uri and poolSize", () => {
		const mgr = new MongoConnectionManager({
			uri: URLString.of("mongodb://localhost:27017"),
			dbName: "test",
			poolSize: 10,
		});
		expect(mgr.uri).toBe("mongodb://localhost:27017");
		expect(mgr.poolSize).toBe(10);
	});

	it("should register close and reconnect event handlers on the client", async () => {
		const mgr = new MongoConnectionManager({
			uri: URLString.of("mongodb://localhost:27017"),
			dbName: "test",
		});
		await mgr.getConnection();

		expect(mockClient.on).toHaveBeenCalledWith("close", expect.any(Function));
		expect(mockClient.on).toHaveBeenCalledWith(
			"reconnect",
			expect.any(Function)
		);
	});

	it("should set _connected to false when close event fires", async () => {
		const mgr = new MongoConnectionManager({
			uri: URLString.of("mongodb://localhost:27017"),
			dbName: "test",
		});
		await mgr.getConnection();

		expect(mgr.isConnected()).toBe(true);

		mockClient.triggerEvent("close");
		expect(mgr.isConnected()).toBe(false);
	});

	it("should set _connected to true when reconnect event fires", async () => {
		const mgr = new MongoConnectionManager({
			uri: URLString.of("mongodb://localhost:27017"),
			dbName: "test",
		});
		await mgr.getConnection();

		mockClient.triggerEvent("close");
		expect(mgr.isConnected()).toBe(false);

		mockClient.triggerEvent("reconnect");
		expect(mgr.isConnected()).toBe(true);
	});

	it("getDb should call client.db with the configured dbName", async () => {
		const mgr = new MongoConnectionManager({
			uri: URLString.of("mongodb://localhost:27017"),
			dbName: "test",
		});
		const db = await mgr.getDb();

		expect(db).toEqual({});
		expect(mockClient.db).toHaveBeenCalledWith("test");
	});

	it("getDb should cache the db instance across calls", async () => {
		const mgr = new MongoConnectionManager({
			uri: URLString.of("mongodb://localhost:27017"),
			dbName: "test",
		});

		const db1 = await mgr.getDb();
		const db2 = await mgr.getDb();

		expect(db1).toBe(db2);
		expect(mockClient.db).toHaveBeenCalledTimes(1);
	});

	it("resetState should clear state so the next getDb calls client.db again", async () => {
		const mgr = new MongoConnectionManager({
			uri: URLString.of("mongodb://localhost:27017"),
			dbName: "test",
		});

		const db1 = await mgr.getDb();
		expect(mockClient.db).toHaveBeenCalledTimes(1);

		await mgr.resetState();
		expect(mgr.isConnected()).toBe(false);

		const db2 = await mgr.getDb();
		expect(db1).not.toBe(db2);
	});
});
