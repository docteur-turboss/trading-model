import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockInsertOne = jest.fn();
const mockFindOne = jest.fn();
const mockCreateIndex = jest.fn();

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { TokenStore } from "../../src/persistence/token-store";

describe("TokenStore", () => {
	let store: TokenStore;

	beforeEach(() => {
		jest.clearAllMocks();
		store = new TokenStore();
	});

	it("should use the provided collection when setCollection is called", () => {
		const collection = {
			insertOne: mockInsertOne,
			findOne: mockFindOne,
			createIndex: mockCreateIndex,
		} as any;
		store.setCollection(collection);
		expect((store as any)._collection).toBe(collection);
	});

	it("should throw tryUseToken when not connected", async () => {
		await expect(
			store.tryUseToken({ token: "tok", serviceId: "svc-1" })
		).rejects.toThrow("not connected");
	});

	it("should return true when insertOne succeeds", async () => {
		mockInsertOne.mockResolvedValue({ acknowledged: true });
		store.setCollection({
			insertOne: mockInsertOne,
			findOne: mockFindOne,
			createIndex: mockCreateIndex,
		} as any);
		const result = await store.tryUseToken({
			token: "token-123",
			serviceId: "svc-1",
		});
		expect(result).toBe(true);
	});

	it("should return false on duplicate key error (code 11000)", async () => {
		mockInsertOne.mockRejectedValue({ code: 11000 });
		store.setCollection({
			insertOne: mockInsertOne,
			findOne: mockFindOne,
			createIndex: mockCreateIndex,
		} as any);
		const result = await store.tryUseToken({
			token: "token-123",
			serviceId: "svc-1",
		});
		expect(result).toBe(false);
	});

	it("should rethrow non-duplicate errors", async () => {
		mockInsertOne.mockRejectedValue(new Error("DB error"));
		store.setCollection({
			insertOne: mockInsertOne,
			findOne: mockFindOne,
			createIndex: mockCreateIndex,
		} as any);
		await expect(
			store.tryUseToken({ token: "tok", serviceId: "svc-1" })
		).rejects.toThrow("DB error");
	});

	it("should markAsUsed throw if already used", async () => {
		mockInsertOne.mockRejectedValue({ code: 11000 });
		store.setCollection({
			insertOne: mockInsertOne,
			findOne: mockFindOne,
			createIndex: mockCreateIndex,
		} as any);
		await expect(
			store.markAsUsed({ token: "tok", serviceId: "svc-1" })
		).rejects.toThrow("already been used");
	});

	it("should return isUsed true when token found", async () => {
		mockFindOne.mockResolvedValue({ tokenHash: "hash" });
		store.setCollection({
			insertOne: mockInsertOne,
			findOne: mockFindOne,
			createIndex: mockCreateIndex,
		} as any);
		const result = await store.isUsed("token-123");
		expect(result).toBe(true);
	});

	it("should return isUsed false when token not found", async () => {
		mockFindOne.mockResolvedValue(null);
		store.setCollection({
			insertOne: mockInsertOne,
			findOne: mockFindOne,
			createIndex: mockCreateIndex,
		} as any);
		const result = await store.isUsed("token-123");
		expect(result).toBe(false);
	});

	it("should throw isUsed when not connected", async () => {
		await expect(store.isUsed("token")).rejects.toThrow("not connected");
	});

	it("should markAsUsed return true when successful", async () => {
		mockInsertOne.mockResolvedValue({ acknowledged: true });
		store.setCollection({
			insertOne: mockInsertOne,
			findOne: mockFindOne,
			createIndex: mockCreateIndex,
		} as any);
		await expect(
			store.markAsUsed({ token: "tok", serviceId: "svc-1" })
		).resolves.toBeUndefined();
	});
});
