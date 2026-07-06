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

import { CertificateStore } from "../../src/persistence/certificate-store";

const SAMPLE_CERT = {
	serialNumber: "SN-001",
	certPem: "cert-pem",
	caPem: "ca-pem",
	serviceId: "svc-1",
	issuedAt: new Date("2024-01-01"),
	expiresAt: new Date("2025-01-01"),
	fingerprint: "abc123",
};

describe("CertificateStore", () => {
	let store: CertificateStore;

	beforeEach(async () => {
		jest.clearAllMocks();
		store = await CertificateStore.connect("mongodb://localhost:27017/test");
	});

	describe("connect", () => {
		it("should connect and create indexes", async () => {
			expect(MOCK_CREATE_INDEX).toHaveBeenCalledWith(
				{ serialNumber: 1 },
				{ unique: true }
			);
			expect(MOCK_CREATE_INDEX).toHaveBeenCalledWith({ serviceId: 1 });
			expect(MOCK_CREATE_INDEX).toHaveBeenCalledWith({ expiresAt: 1 });
		});
	});

	describe("disconnect", () => {
		it("should close the connection", async () => {
			await store.disconnect();

			expect(MOCK_CLOSE).toHaveBeenCalled();
		});
	});

	describe("save", () => {
		it("should insert certificate document", async () => {
			await store.save(SAMPLE_CERT);

			expect(MOCK_INSERT_ONE).toHaveBeenCalledWith(SAMPLE_CERT);
		});
	});

	describe("getBySerial", () => {
		it("should return certificate by serial number", async () => {
			MOCK_FIND_ONE.mockResolvedValue(SAMPLE_CERT);

			const result = await store.getBySerial("SN-001");

			expect(MOCK_FIND_ONE).toHaveBeenCalledWith({ serialNumber: "SN-001" });
			expect(result).toEqual(SAMPLE_CERT);
		});

		it("should return null when not found", async () => {
			MOCK_FIND_ONE.mockResolvedValue(null);

			const result = await store.getBySerial("SN-MISSING");

			expect(result).toBeNull();
		});
	});

	describe("getByServiceId", () => {
		it("should return latest certificate by serviceId", async () => {
			MOCK_FIND_ONE.mockResolvedValue(SAMPLE_CERT);

			const result = await store.getByServiceId("svc-1");

			expect(MOCK_FIND_ONE).toHaveBeenCalledWith(
				{ serviceId: "svc-1" },
				{ sort: { issuedAt: -1 } }
			);
			expect(result).toEqual(SAMPLE_CERT);
		});

		it("should return null when not found", async () => {
			MOCK_FIND_ONE.mockResolvedValue(null);

			const result = await store.getByServiceId("svc-missing");

			expect(result).toBeNull();
		});
	});

	describe("getExpiring", () => {
		it("should return certificates expiring within margin", async () => {
			MOCK_FIND.mockReturnValue({
				toArray: jest.fn().mockResolvedValue([SAMPLE_CERT]),
			});

			const result = await store.getExpiring(86400000);

			expect(MOCK_FIND).toHaveBeenCalledWith({
				expiresAt: { $lte: expect.any(Date) },
			});
			expect(result).toHaveLength(1);
			expect(result[0].serialNumber).toBe("SN-001");
		});

		it("should return empty array when none expiring", async () => {
			MOCK_FIND.mockReturnValue({
				toArray: jest.fn().mockResolvedValue([]),
			});

			const result = await store.getExpiring(86400000);

			expect(result).toEqual([]);
		});
	});
});
