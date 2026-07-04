import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockInsertOne = jest.fn();
const mockFindOne = jest.fn();
const mockCreateIndex = jest.fn();

jest.mock("mongodb", () => ({
	MongoClient: jest.fn().mockImplementation(() => ({
		connect: jest.fn().mockResolvedValue(undefined),
		db: jest.fn(() => ({
			collection: jest.fn(() => ({
				insertOne: mockInsertOne,
				findOne: mockFindOne,
				createIndex: mockCreateIndex,
			})),
		})),
		close: jest.fn().mockResolvedValue(undefined),
	})),
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockIsInitialized = jest.fn().mockReturnValue(false);
jest.mock("../../src/persistence/mongo-manager", () => ({
	MONGO_MANAGER: {
		isInitialized: mockIsInitialized,
		getDb: jest.fn(() => ({
			collection: jest.fn(() => ({
				insertOne: mockInsertOne,
				findOne: mockFindOne,
				createIndex: mockCreateIndex,
			})),
		})),
	},
}));

import { TokenStore } from "../../src/persistence/token-store";

describe("TokenStore", () => {
	let store: TokenStore;

	beforeEach(() => {
		jest.clearAllMocks();
		mockIsInitialized.mockReturnValue(false);
		store = new TokenStore("mongodb://localhost:27017/test");
	});

	it("should connect and create indexes", async () => {
		await store.connect();
		expect(mockCreateIndex).toHaveBeenCalled();
	});

	it("should use MONGO_MANAGER when initialized", async () => {
		mockIsInitialized.mockReturnValue(true);
		await store.connect();
		expect(mockCreateIndex).toHaveBeenCalled();
	});

	it("should throw tryUseToken when not connected", async () => {
		await expect(store.tryUseToken("tok", "svc-1")).rejects.toThrow(
			"not connected"
		);
	});

	it("should return true when insertOne succeeds", async () => {
		mockInsertOne.mockResolvedValue({ acknowledged: true });
		await store.connect();
		const result = await store.tryUseToken("token-123", "svc-1");
		expect(result).toBe(true);
	});

	it("should return false on duplicate key error (code 11000)", async () => {
		mockInsertOne.mockRejectedValue({ code: 11000 });
		await store.connect();
		const result = await store.tryUseToken("token-123", "svc-1");
		expect(result).toBe(false);
	});

	it("should rethrow non-duplicate errors", async () => {
		mockInsertOne.mockRejectedValue(new Error("DB error"));
		await store.connect();
		await expect(store.tryUseToken("tok", "svc-1")).rejects.toThrow("DB error");
	});

	it("should markAsUsed throw if already used", async () => {
		mockInsertOne.mockRejectedValue({ code: 11000 });
		await store.connect();
		await expect(store.markAsUsed("tok", "svc-1")).rejects.toThrow(
			"already been used"
		);
	});

	it("should return isUsed true when token found", async () => {
		mockFindOne.mockResolvedValue({ tokenHash: "hash" });
		await store.connect();
		const result = await store.isUsed("token-123");
		expect(result).toBe(true);
	});

	it("should return isUsed false when token not found", async () => {
		mockFindOne.mockResolvedValue(null);
		await store.connect();
		const result = await store.isUsed("token-123");
		expect(result).toBe(false);
	});

	it("should throw isUsed when not connected", async () => {
		await expect(store.isUsed("token")).rejects.toThrow("not connected");
	});

	it("should disconnect", async () => {
		await store.connect();
		await store.disconnect();
	});

	it("should markAsUsed return true when successful", async () => {
		mockInsertOne.mockResolvedValue({ acknowledged: true });
		await store.connect();
		await expect(store.markAsUsed("tok", "svc-1")).resolves.toBeUndefined();
	});
});
