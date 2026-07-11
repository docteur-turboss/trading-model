import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_INSERT_ONE = jest.fn();
const MOCK_FIND_ONE = jest.fn();
const MOCK_FIND = jest.fn();
const MOCK_CREATE_INDEX = jest.fn();
const MOCK_COLLECTION = jest.fn(() => ({
	insertOne: MOCK_INSERT_ONE,
	findOne: MOCK_FIND_ONE,
	find: MOCK_FIND,
	createIndex: MOCK_CREATE_INDEX,
}));

jest.mock("../../src/persistence/mongo-manager", () => ({
	MONGO_MANAGER: {
		getDb: jest.fn().mockResolvedValue({
			collection: MOCK_COLLECTION,
		}),
	},
}));

import { CrlStore } from "../../src/persistence/crl-store";

const SAMPLE_REVOKED = {
	serialNumber: "SN-REVOKED",
	serviceId: "svc-1",
	revokedAt: new Date("2024-06-01"),
	reason: "key_compromise",
};

describe("CrlStore", () => {
	let store: CrlStore;

	beforeEach(async () => {
		jest.clearAllMocks();
		store = await CrlStore.connect("mongodb://localhost:27017/test");
	});

	describe("connect", () => {
		it("should create indexes on connect", async () => {
			expect(MOCK_CREATE_INDEX).toHaveBeenCalledWith(
				{ serialNumber: 1 },
				{ unique: true }
			);
		});
	});

	describe("disconnect", () => {
		it("should not throw on disconnect", async () => {
			await expect(store.disconnect()).resolves.toBeUndefined();
		});
	});

	describe("save", () => {
		it("should insert revoked certificate entry", async () => {
			await store.insert(SAMPLE_REVOKED);

			expect(MOCK_INSERT_ONE).toHaveBeenCalledWith(SAMPLE_REVOKED);
		});
	});

	describe("getAll", () => {
		it("should return all revoked certificates", async () => {
			MOCK_FIND.mockReturnValue({
				toArray: jest.fn().mockResolvedValue([SAMPLE_REVOKED]),
			});

			const result = await store.getAll();

			expect(result).toHaveLength(1);
			expect(result[0].serialNumber).toBe("SN-REVOKED");
		});

		it("should return empty array when none revoked", async () => {
			MOCK_FIND.mockReturnValue({
				toArray: jest.fn().mockResolvedValue([]),
			});

			const result = await store.getAll();

			expect(result).toEqual([]);
		});
	});

	describe("isRevoked", () => {
		it("should return true for revoked serial", async () => {
			MOCK_FIND_ONE.mockResolvedValue(SAMPLE_REVOKED);

			const result = await store.isRevoked("SN-REVOKED");

			expect(result).toBe(true);
		});

		it("should return false for non-revoked serial", async () => {
			MOCK_FIND_ONE.mockResolvedValue(null);

			const result = await store.isRevoked("SN-NOT-REVOKED");

			expect(result).toBe(false);
		});
	});
});
