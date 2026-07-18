import { describe, expect, it, jest } from "@jest/globals";

const MOCK_GET_COLLECTION = jest.fn();
const _MOCK_FIND = jest.fn();
const _MOCK_TO_ARRAY = jest.fn();
const _MOCK_BULK_WRITE = jest.fn();

jest.mock("../../src/config/env", () => ({
	ENV: {
		MONGO_URI: "mongodb://localhost:27017/test",
		MONGO_DB: "test",
		MONGO_COLLECTION: "test",
		INSTANCE_ID: "test-instance",
		TLS_KEY_PATH: "",
		TLS_CERT_PATH: "",
		TLS_CA_PATH: "",
	},
}));

jest.mock("../../src/config/db", () => ({
	getCollection: MOCK_GET_COLLECTION,
}));

jest.mock("../../src/dlq/claim-filter-builder", () => ({
	ClaimFilterBuilder: jest.fn(() => ({
		buildClaimFilter: jest.fn(() => ({ status: "pending" })),
		buildAtomicCondition: jest.fn(() => ({ status: "pending" })),
		buildBulkUpdateOps: jest.fn(() => []),
		toValidObjectIds: jest.fn((ids: string[]) => ids.filter(Boolean)),
	})),
}));

const MOCK_FIND_CANDIDATES = jest.fn();
const MOCK_EXECUTE_BULK_CLAIM = jest.fn();
const MOCK_FETCH_CLAIMED = jest.fn();

jest.mock("../../src/dlq/claim-query-executor", () => ({
	ClaimQueryExecutor: jest.fn(() => ({
		findClaimCandidates: MOCK_FIND_CANDIDATES,
		executeBulkClaim: MOCK_EXECUTE_BULK_CLAIM,
		fetchClaimedByIds: MOCK_FETCH_CLAIMED,
		claimByIds: jest.fn(),
	})),
}));

describe("DlqClaimManager", () => {
	let DlqClaimManagerClass: new () => {
		claimEntriesForRetry: (opts: Record<string, unknown>) => Promise<unknown[]>;
		claimEntriesByIds: (
			ids: string[],
			ctx: Record<string, unknown>
		) => Promise<unknown[]>;
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/dlq/claim-manager") as {
			DlqClaimManager: typeof DlqClaimManagerClass;
		};
		DlqClaimManagerClass = mod.DlqClaimManager;
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return empty when claimEntriesForRetry has no candidates", async () => {
		const mockCol = {};
		MOCK_GET_COLLECTION.mockResolvedValue(mockCol);
		MOCK_FIND_CANDIDATES.mockResolvedValue([]);

		const manager = new DlqClaimManagerClass();
		const result = await manager.claimEntriesForRetry({
			limit: 10,
			batchId: "b-1",
			instanceId: "i-1",
		});

		expect(result).toEqual([]);
	});

	it("should return empty when claimEntriesByIds has no ids", async () => {
		const mockCol = {};
		MOCK_GET_COLLECTION.mockResolvedValue(mockCol);

		const manager = new DlqClaimManagerClass();
		const result = await manager.claimEntriesByIds([], {
			batchId: "b-1",
			instanceId: "i-1",
		});

		expect(result).toEqual([]);
	});

	it("should return empty when claimEntriesByIds has no valid ids", async () => {
		const mockCol = {};
		MOCK_GET_COLLECTION.mockResolvedValue(mockCol);

		const manager = new DlqClaimManagerClass();
		const result = await manager.claimEntriesByIds(["", null] as string[], {
			batchId: "b-1",
			instanceId: "i-1",
		});

		expect(result).toEqual([]);
	});
});
