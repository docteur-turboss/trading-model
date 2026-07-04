import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_INSERT_ONE = jest.fn();
const MOCK_FIND_ONE = jest.fn();
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
});

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

	beforeEach(() => {
		jest.clearAllMocks();
		store = new CaStore("mongodb://localhost:27017/test");
	});

	describe("connect", () => {
		it("should connect to database", async () => {
			await store.connect();

			expect(MOCK_COLLECTION).toHaveBeenCalledWith("ca_store");
		});
	});

	describe("disconnect", () => {
		it("should close the connection", async () => {
			await store.connect();
			await store.disconnect();

			expect(MOCK_CLOSE).toHaveBeenCalled();
		});
	});

	describe("save", () => {
		it("should throw if not connected", async () => {
			await expect(store.save(SAMPLE_CA_META)).rejects.toThrow("Not connected");
		});

		it("should insert metadata document", async () => {
			await store.connect();
			await store.save(SAMPLE_CA_META);

			expect(MOCK_INSERT_ONE).toHaveBeenCalledWith(SAMPLE_CA_META);
		});
	});

	describe("getLatest", () => {
		it("should throw if not connected", async () => {
			await expect(store.getLatest()).rejects.toThrow("Not connected");
		});

		it("should return the latest CA metadata", async () => {
			MOCK_FIND_ONE.mockResolvedValue(SAMPLE_CA_META);
			await store.connect();

			const result = await store.getLatest();

			expect(MOCK_FIND_ONE).toHaveBeenCalledWith(
				{},
				{ sort: { createdAt: -1 } }
			);
			expect(result).toEqual(SAMPLE_CA_META);
		});

		it("should return null when no metadata exists", async () => {
			MOCK_FIND_ONE.mockResolvedValue(null);
			await store.connect();

			const result = await store.getLatest();

			expect(result).toBeNull();
		});
	});
});
