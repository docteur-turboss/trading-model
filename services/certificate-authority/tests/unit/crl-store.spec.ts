import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_INSERT_ONE = jest.fn();
const MOCK_FIND_ONE = jest.fn();
const MOCK_FIND = jest.fn();
const MOCK_CREATE_INDEX = jest.fn();
const MOCK_COLLECTION = jest.fn();
const MOCK_DB = jest.fn();
const MOCK_CLOSE = jest.fn();

jest.mock("mongodb", () => ({
	MongoClient: jest.fn().mockImplementation(() => ({
		connect: jest.fn().mockResolvedValue(undefined),
		close: MOCK_CLOSE,
		db: MOCK_DB,
	})),
}));

MOCK_DB.mockReturnValue({
	collection: MOCK_COLLECTION,
});

MOCK_COLLECTION.mockReturnValue({
	insertOne: MOCK_INSERT_ONE,
	findOne: MOCK_FIND_ONE,
	find: MOCK_FIND,
	createIndex: MOCK_CREATE_INDEX,
});

import { CrlStore } from "../../src/persistence/crl-store";

const SAMPLE_REVOKED = {
	serialNumber: "SN-REVOKED",
	serviceId: "svc-1",
	revokedAt: new Date("2024-06-01"),
	reason: "key_compromise",
};

describe("CrlStore", () => {
	let store: CrlStore;

	beforeEach(() => {
		jest.clearAllMocks();
		store = new CrlStore("mongodb://localhost:27017/test");
	});

	describe("connect", () => {
		it("should create indexes on connect", async () => {
			await store.connect();

			expect(MOCK_CREATE_INDEX).toHaveBeenCalledWith(
				{ serialNumber: 1 },
				{ unique: true }
			);
		});
	});

	describe("disconnect", () => {
		it("should close the connection", async () => {
			await store.connect();
			await store.disconnect();

			expect(MOCK_CLOSE).toHaveBeenCalled();
		});
	});

	describe("add", () => {
		it("should throw if not connected", async () => {
			await expect(store.add(SAMPLE_REVOKED)).rejects.toThrow("Not connected");
		});

		it("should insert revoked certificate entry", async () => {
			await store.connect();
			await store.add(SAMPLE_REVOKED);

			expect(MOCK_INSERT_ONE).toHaveBeenCalledWith(SAMPLE_REVOKED);
		});
	});

	describe("getAll", () => {
		it("should throw if not connected", async () => {
			await expect(store.getAll()).rejects.toThrow("Not connected");
		});

		it("should return all revoked certificates", async () => {
			MOCK_FIND.mockReturnValue({
				toArray: jest.fn().mockResolvedValue([SAMPLE_REVOKED]),
			});
			await store.connect();

			const result = await store.getAll();

			expect(result).toHaveLength(1);
			expect(result[0].serialNumber).toBe("SN-REVOKED");
		});

		it("should return empty array when none revoked", async () => {
			MOCK_FIND.mockReturnValue({
				toArray: jest.fn().mockResolvedValue([]),
			});
			await store.connect();

			const result = await store.getAll();

			expect(result).toEqual([]);
		});
	});

	describe("isRevoked", () => {
		it("should throw if not connected", async () => {
			await expect(store.isRevoked("SN-001")).rejects.toThrow("Not connected");
		});

		it("should return true for revoked serial", async () => {
			MOCK_FIND_ONE.mockResolvedValue(SAMPLE_REVOKED);
			await store.connect();

			const result = await store.isRevoked("SN-REVOKED");

			expect(result).toBe(true);
		});

		it("should return false for non-revoked serial", async () => {
			MOCK_FIND_ONE.mockResolvedValue(null);
			await store.connect();

			const result = await store.isRevoked("SN-NOT-REVOKED");

			expect(result).toBe(false);
		});
	});
});
