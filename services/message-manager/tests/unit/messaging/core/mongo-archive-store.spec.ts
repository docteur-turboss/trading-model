import { describe, it, jest } from "@jest/globals";

jest.mock("mongodb", () => ({
	MongoClient: jest.fn().mockImplementation(() => ({
		connect: jest.fn().mockResolvedValue(undefined),
		db: jest.fn(() => ({
			collection: jest.fn(() => ({
				createIndex: jest.fn().mockResolvedValue("index-created"),
				bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
			})),
		})),
		close: jest.fn().mockResolvedValue(undefined),
		on: jest.fn(),
	})),
}));

jest.mock("../../../../src/config/redis", () => ({
	getSubscriptionClient: jest.fn().mockResolvedValue({
		smembers: jest.fn().mockResolvedValue(["topic-a", "topic-b"]),
	}),
}));

jest.mock("../../../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../../src/config/env", () => ({
	ENV: {
		MONGO_ARCHIVE_URI: "mongodb://mongo:27017",
		MONGO_ARCHIVE_DB: "test_archive",
		MONGO_ARCHIVE_COLLECTION: "archived_messages",
		MONGO_ARCHIVE_INTERVAL_MS: 60000,
		MONGO_ARCHIVE_BATCH_SIZE: 100,
		MONGO_ARCHIVE_RETENTION_DAYS: 30,
		REDIS_PREFIX: "mm:",
	},
}));

jest.mock("../../../../src/messaging/core/message-store", () => ({
	messageStore: {
		getMessagesAfter: jest.fn().mockResolvedValue([
			{
				metadata: {
					messageId: "msg-1",
					topic: "topic-a",
					eventType: "TestEvent",
					publisher: { serviceName: "test-service" },
				},
				payload: { key: "value" },
			},
		]),
	},
}));

import { MongoArchiveStore } from "../../../../src/messaging/core/mongo-archive-store";

describe("MongoArchiveStore", () => {
	it("should start and connect to MongoDB", async () => {
		const store = new MongoArchiveStore();
		await store.start();
	});

	it("should not start twice", async () => {
		const store = new MongoArchiveStore();
		await store.start();
		await store.start();
	});

	it("should stop and clean up", async () => {
		const store = new MongoArchiveStore();
		await store.start();
		await store.stop();
	});

	it("should stop when not started", async () => {
		const store = new MongoArchiveStore();
		await store.stop();
	});

	it("should handle index failure", async () => {
		const mongodb = require("mongodb");
		const origImpl = mongodb.MongoClient;
		mongodb.MongoClient = jest.fn().mockImplementation(() => ({
			connect: jest.fn().mockResolvedValue(undefined),
			db: jest.fn(() => ({
				collection: jest.fn(() => ({
					createIndex: jest.fn().mockRejectedValue(new Error("index error")),
					bulkWrite: jest.fn().mockResolvedValue({}),
				})),
			})),
			close: jest.fn().mockResolvedValue(undefined),
			on: jest.fn(),
		}));

		const store = new MongoArchiveStore();
		await store.start();
		await store.stop();

		mongodb.MongoClient = origImpl;
	});
});
