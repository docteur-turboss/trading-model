import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockFindOne = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockDeleteOne = jest.fn();
const mockCreateIndex = jest.fn();
const mockConnect = jest.fn();
const mockClose = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisEval = jest.fn();
const mockRedisDisconnect = jest.fn();
const mockRedisOn = jest.fn();
const mockReaddir = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockUnlink = jest.fn();
const mockMkdir = jest.fn();

jest.mock("mongodb", () => ({
	MongoClient: jest.fn().mockImplementation(() => ({
		connect: mockConnect,
		close: mockClose,
		db: jest.fn(() => ({
			collection: jest.fn(() => ({
				findOne: mockFindOne,
				findOneAndUpdate: mockFindOneAndUpdate,
				deleteOne: mockDeleteOne,
				createIndex: mockCreateIndex,
			})),
		})),
	})),
}));

jest.mock("ioredis", () => {
	return jest.fn().mockImplementation(() => ({
		get: mockRedisGet,
		set: mockRedisSet,
		eval: mockRedisEval,
		disconnect: mockRedisDisconnect,
		on: mockRedisOn,
	}));
});

jest.mock("node:fs/promises", () => ({
	mkdir: mockMkdir,
	readdir: mockReaddir,
	readFile: mockReadFile,
	writeFile: mockWriteFile,
	unlink: mockUnlink,
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
				findOne: mockFindOne,
				findOneAndUpdate: mockFindOneAndUpdate,
				deleteOne: mockDeleteOne,
				createIndex: mockCreateIndex,
			})),
		})),
	},
}));

import { DistributedLock } from "../../src/persistence/distributed-lock";

const LOCK_OPTS = {
	uri: "mongodb://localhost:27017/test",
	lockName: "test-lock",
	ttlMs: 5000,
};

describe("DistributedLock", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockMongoIsInitialized.mockReturnValue(false);
		mockConnect.mockResolvedValue(undefined);
		mockFindOne.mockResolvedValue(null);
		mockFindOneAndUpdate.mockResolvedValue(null);
	});

	it("should connect to MongoDB and create indexes", async () => {
		const lock = DistributedLock.fromOptions(LOCK_OPTS);
		await lock.connect();
		expect(mockCreateIndex).toHaveBeenCalledTimes(2);
	});

	it("should use MONGO_MANAGER when initialized", async () => {
		mockMongoIsInitialized.mockReturnValue(true);
		const lock = DistributedLock.fromOptions(LOCK_OPTS);
		await lock.connect();
		expect(mockCreateIndex).toHaveBeenCalled();
	});

	it("should acquire lock via MongoDB", async () => {
		mockFindOneAndUpdate.mockResolvedValue(null);
		const lock = DistributedLock.fromOptions(LOCK_OPTS);
		await lock.connect();
		const acquired = await lock.acquire();
		expect(acquired).toBe(true);
	});

	it("should return false when MongoDB lock is held", async () => {
		mockFindOneAndUpdate.mockResolvedValue({
			name: "test-lock",
			instanceId: "other",
			fencingToken: 1,
			expiresAt: new Date(Date.now() + 100000),
		});
		const lock = DistributedLock.fromOptions(LOCK_OPTS);
		await lock.connect();
		const acquired = await lock.acquire();
		expect(acquired).toBe(false);
	});

	it("should acquire lock when MongoDB expired", async () => {
		mockFindOneAndUpdate.mockResolvedValue({
			name: "test-lock",
			instanceId: "other",
			fencingToken: 1,
			expiresAt: new Date(Date.now() - 100000),
		});
		const lock = DistributedLock.fromOptions(LOCK_OPTS);
		await lock.connect();
		const acquired = await lock.acquire();
		expect(acquired).toBe(true);
	});

	it("should release lock via MongoDB", async () => {
		mockFindOneAndUpdate.mockResolvedValue(null);
		mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
		const lock = DistributedLock.fromOptions(LOCK_OPTS);
		await lock.connect();
		await lock.acquire();
		await lock.release();
		expect(mockDeleteOne).toHaveBeenCalled();
	});

	it("should verify ownership", async () => {
		mockFindOneAndUpdate.mockResolvedValue(null);
		mockFindOne.mockResolvedValue({
			name: "test-lock",
			instanceId: "test-instance",
			fencingToken: 1,
		});
		const lock = DistributedLock.fromOptions(LOCK_OPTS);
		(lock as any)._context.instanceId = "test-instance";
		(lock as any)._currentFencingToken = 1;
		await lock.connect();
		const token = await lock.verifyOwnership();
		expect(token).toBe(1);
	});

	it("should return -1 from verifyOwnership when not acquired", async () => {
		const lock = DistributedLock.fromOptions(LOCK_OPTS);
		const token = await lock.verifyOwnership();
		expect(token).toBe(-1);
	});

	it("should disconnect", async () => {
		const lock = DistributedLock.fromOptions(LOCK_OPTS);
		await lock.connect();
		await lock.disconnect();
		expect(mockClose).toHaveBeenCalled();
	});

	it("should handle MongoDB failure gracefully during acquire without fallback", async () => {
		const oldNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		mockFindOneAndUpdate.mockRejectedValue(new Error("DB error"));
		const lock = DistributedLock.fromOptions(LOCK_OPTS);
		await lock.connect();
		const result = await lock.acquire();
		expect(result).toBe(false);
		process.env.NODE_ENV = oldNodeEnv;
	});

	it("should try Redis with redisUrl on acquire", async () => {
		mockFindOneAndUpdate.mockRejectedValue(new Error("DB error"));
		mockRedisSet.mockResolvedValue("OK");
		const lock = DistributedLock.fromOptions({
			...LOCK_OPTS,
			redisUrl: "redis://localhost:6379",
		});
		await lock.connect();
		const _acquired = await lock.acquire();
		expect(mockRedisSet).toHaveBeenCalled();
	});

	it("should try file fallback in dev mode", async () => {
		const oldNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "development";
		mockFindOneAndUpdate.mockRejectedValue(new Error("DB error"));
		mockMkdir.mockResolvedValue(undefined);
		mockWriteFile.mockResolvedValue(undefined);

		const lock = DistributedLock.fromOptions(LOCK_OPTS);
		await lock.connect();
		const acquired = await lock.acquire();
		expect(acquired).toBe(true);

		process.env.NODE_ENV = oldNodeEnv;
	});

	it("should reject file fallback in production", async () => {
		const oldNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		mockFindOneAndUpdate.mockRejectedValue(new Error("DB error"));

		const lock = DistributedLock.fromOptions(LOCK_OPTS);
		await lock.connect();
		const acquired = await lock.acquire();
		expect(acquired).toBe(false);

		process.env.NODE_ENV = oldNodeEnv;
	});

	it("should release using file fallback when MongoDB and Redis unavailable", async () => {
		mockUnlink.mockResolvedValue(undefined);
		const lock = DistributedLock.fromOptions(LOCK_OPTS);
		(lock as any)._currentFencingToken = -1;
		await lock.release();
	});
});
