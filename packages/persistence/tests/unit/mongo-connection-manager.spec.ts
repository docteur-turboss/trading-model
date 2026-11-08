import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { URLString } from "@trading-model/primitives/primitives";
import { MongoClient } from "mongodb";
import { MongoConnectionManager } from "../../src/mongo-connection-manager";

interface MockClient {
	connect: jest.Mock<() => Promise<void>>;
	close: jest.Mock<() => Promise<void>>;
	db: jest.Mock<(name: string) => object>;
	on: jest.Mock<(event: string, handler: (arg: unknown) => void) => void>;
	triggerEvent(event: string, arg?: unknown): void;
}

jest.mock("mongodb", () => ({
	MongoClient: jest.fn(),
}));

const MockMongoClient = MongoClient as unknown as jest.Mock;

let mockClient: MockClient;

function createMockClient(): MockClient {
	const eventHandlers: Record<string, (arg: unknown) => void> = {};
	return {
		connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		db: jest.fn<(name: string) => object>().mockImplementation(() => ({})),
		on: jest
			.fn<(event: string, handler: (arg: unknown) => void) => void>()
			.mockImplementation((event, handler) => {
				eventHandlers[event] = handler;
			}),
		triggerEvent(event: string, arg?: unknown) {
			eventHandlers[event]?.(arg);
		},
	};
}

describe("MongoConnectionManager", () => {
	beforeEach(() => {
		mockClient = createMockClient();
		MockMongoClient.mockReturnValue(mockClient);
	});

	// The real driver behaviour is in tests/db/mongo-outage.db.spec.ts.
	it("should follow the data-bearing servers of the monitored topology", async () => {
		const mgr = new MongoConnectionManager({
			uri: URLString.of("mongodb://localhost:27017"),
			dbName: "test",
		});
		await mgr.getConnection();
		expect(mgr.isConnected()).toBe(true);

		mockClient.triggerEvent("topologyDescriptionChanged", {
			newDescription: { hasDataBearingServers: false },
		});
		expect(mgr.isConnected()).toBe(false);

		mockClient.triggerEvent("topologyDescriptionChanged", {
			newDescription: { hasDataBearingServers: true },
		});
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

describe("MongoConnectionManager collection name", () => {
	it("should expose the configured collectionName to subclasses", () => {
		class TestStore extends MongoConnectionManager {
			collection(): string | undefined {
				return this.collectionName;
			}
		}
		const mgr = new TestStore({
			uri: URLString.of("mongodb://localhost:27017"),
			dbName: "test",
			collectionName: "audit_entries",
		});
		expect(mgr.collection()).toBe("audit_entries");
	});

	it("should expose an undefined collectionName when not configured", () => {
		class TestStore extends MongoConnectionManager {
			collection(): string | undefined {
				return this.collectionName;
			}
		}
		const mgr = new TestStore({
			uri: URLString.of("mongodb://localhost:27017"),
			dbName: "test",
		});
		expect(mgr.collection()).toBeUndefined();
	});
});
