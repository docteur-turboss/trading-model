import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_INSERT_ONE = jest.fn();
const MOCK_FIND_ONE = jest.fn();
const MOCK_COLLECTION = jest.fn(() => ({
	insertOne: MOCK_INSERT_ONE,
	findOne: MOCK_FIND_ONE,
}));

jest.mock("../../src/persistence/mongo-manager", () => ({
	MONGO_MANAGER: {
		getDb: jest.fn().mockResolvedValue({
			collection: MOCK_COLLECTION,
		}),
	},
}));

import { CaStore } from "../../src/persistence/ca-store";

const SAMPLE_CA_META = {
	id: "CA-001",
	caCertPem: "-----BEGIN CERTIFICATE-----\nca-cert\n-----END CERTIFICATE-----",
	createdAt: new Date("2024-01-01"),
	expiresAt: new Date("2025-01-01"),
	fingerprint: "abc123",
};

describe("CaStore", () => {
	let store: CaStore;

	beforeEach(async () => {
		jest.clearAllMocks();
		store = await CaStore.connect("mongodb://localhost:27017/test");
	});

	describe("connect", () => {
		it("should connect to database", async () => {
			expect(MOCK_COLLECTION).toHaveBeenCalledWith("ca_store");
		});
	});

	describe("disconnect", () => {
		it("should not throw on disconnect", async () => {
			await expect(store.disconnect()).resolves.toBeUndefined();
		});
	});

	describe("save", () => {
		it("should insert metadata document", async () => {
			await store.insert(SAMPLE_CA_META);

			expect(MOCK_INSERT_ONE).toHaveBeenCalledWith(SAMPLE_CA_META);
		});
	});

	describe("getLatest", () => {
		it("should return the latest CA metadata", async () => {
			MOCK_FIND_ONE.mockResolvedValue(SAMPLE_CA_META);

			const result = await store.getLatest();

			expect(MOCK_FIND_ONE).toHaveBeenCalledWith(
				{},
				{ sort: { createdAt: -1 } }
			);
			expect(result).toEqual(SAMPLE_CA_META);
		});

		it("should return null when no metadata exists", async () => {
			MOCK_FIND_ONE.mockResolvedValue(null);

			const result = await store.getLatest();

			expect(result).toBeNull();
		});
	});
});
