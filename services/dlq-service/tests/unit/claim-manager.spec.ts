import { describe, expect, it, jest } from "@jest/globals";

const MOCK_GET_COLLECTION = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/infrastructure/config/env", () => ({
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

jest.mock("../../src/adapters/outbound/dlq-query-builder", () => ({
	DlqQueryBuilder: jest.fn((..._args: any[]) => ({
		buildClaimFilter: jest.fn((..._args: any[]) => ({ status: "pending" })),
		buildQueuableQuery: jest.fn((..._args: any[]) => ({ status: "pending" })),
		buildBulkUpdateOps: jest.fn((..._args: any[]) => []),
		toValidObjectIds: jest.fn((ids: string[]) => ids.filter(Boolean)),
	})),
}));

describe("DlqClaimManager", () => {
	let DlqClaimManagerClass: new (
		getCollection: never
	) => {
		claimEntriesForRetry: (opts: Record<string, unknown>) => Promise<unknown[]>;
		claimEntriesByIds: (
			ids: string[],
			ctx: Record<string, unknown>
		) => Promise<unknown[]>;
	};

	beforeAll(() => {
		const mod = jest.requireActual(
			"../../src/adapters/outbound/claim-manager"
		) as {
			DlqClaimManager: typeof DlqClaimManagerClass;
		};
		DlqClaimManagerClass = mod.DlqClaimManager;
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	function mockCol(found: unknown[][], modifiedCount: number) {
		const finds = [...found];
		return {
			find: jest.fn((..._args: unknown[]) => ({
				toArray: jest.fn(async (..._args: any[]) => finds.shift() ?? []),
			})),
			bulkWrite: jest.fn(async (..._ops: unknown[]) => ({ modifiedCount })),
		};
	}

	const doc = (id: string) => ({
		_id: { toHexString: () => id },
		topic: "t",
		message: {},
		deliveryAttempt: 1,
		createdAt: new Date(0),
	});

	it("should return empty when claimEntriesForRetry has no candidates", async () => {
		const col = mockCol([[]], 0);
		MOCK_GET_COLLECTION.mockResolvedValue(col);

		const manager = new DlqClaimManagerClass(MOCK_GET_COLLECTION as never);
		const result = await manager.claimEntriesForRetry({
			limit: 10,
			batchId: "b-1",
			instanceId: "i-1",
		});

		expect(result).toEqual([]);
		expect(col.bulkWrite).not.toHaveBeenCalled();
	});

	it("should return empty when no candidate was claimed", async () => {
		const col = mockCol([[doc("a")]], 0);
		MOCK_GET_COLLECTION.mockResolvedValue(col);

		const manager = new DlqClaimManagerClass(MOCK_GET_COLLECTION as never);
		const result = await manager.claimEntriesForRetry({
			limit: 10,
			batchId: "b-1",
			instanceId: "i-1",
		});

		expect(result).toEqual([]);
	});

	it("should skip the re-read when every candidate was claimed", async () => {
		const col = mockCol([[doc("a"), doc("b")]], 2);
		MOCK_GET_COLLECTION.mockResolvedValue(col);

		const manager = new DlqClaimManagerClass(MOCK_GET_COLLECTION as never);
		const result = await manager.claimEntriesForRetry({
			limit: 10,
			batchId: "b-1",
			instanceId: "i-1",
		});

		expect(result).toHaveLength(2);
		expect(col.find).toHaveBeenCalledTimes(1);
		expect(col.find).toHaveBeenCalledWith(
			{ status: "pending" },
			expect.objectContaining({ sort: { createdAt: -1 }, limit: 10 })
		);
		expect(col.bulkWrite).toHaveBeenCalledWith([], { ordered: false });
	});

	it("should re-read only the entries claimed by this batch on contention", async () => {
		const col = mockCol([[doc("a"), doc("b")], [doc("b")]], 1);
		MOCK_GET_COLLECTION.mockResolvedValue(col);

		const manager = new DlqClaimManagerClass(MOCK_GET_COLLECTION as never);
		const result = (await manager.claimEntriesForRetry({
			limit: 10,
			batchId: "b-1",
			instanceId: "i-1",
		})) as { id: string }[];

		expect(result.map((e) => e.id)).toEqual(["b"]);
		expect(col.find).toHaveBeenLastCalledWith(
			{ _id: { $in: expect.any(Array) }, lastBatchId: "b-1" },
			expect.any(Object)
		);
	});

	it("should claim by ids then read the claimed entries", async () => {
		const col = mockCol([[doc("a")]], 1);
		MOCK_GET_COLLECTION.mockResolvedValue(col);

		const manager = new DlqClaimManagerClass(MOCK_GET_COLLECTION as never);
		const result = await manager.claimEntriesByIds(["a"], {
			batchId: "b-1",
			instanceId: "i-1",
		});

		expect(result).toHaveLength(1);
		expect(col.bulkWrite).toHaveBeenCalledTimes(1);
		expect(col.find).toHaveBeenCalledWith(
			{ _id: { $in: ["a"] }, lastBatchId: "b-1" },
			expect.any(Object)
		);
	});

	it("should return empty when claimEntriesByIds has no ids", async () => {
		MOCK_GET_COLLECTION.mockResolvedValue(mockCol([], 0));

		const manager = new DlqClaimManagerClass(MOCK_GET_COLLECTION as never);
		const result = await manager.claimEntriesByIds([], {
			batchId: "b-1",
			instanceId: "i-1",
		});

		expect(result).toEqual([]);
	});

	it("should return empty when claimEntriesByIds has no valid ids", async () => {
		MOCK_GET_COLLECTION.mockResolvedValue(mockCol([], 0));

		const manager = new DlqClaimManagerClass(MOCK_GET_COLLECTION as never);
		const result = await manager.claimEntriesByIds(["", null] as string[], {
			batchId: "b-1",
			instanceId: "i-1",
		});

		expect(result).toEqual([]);
	});
});
