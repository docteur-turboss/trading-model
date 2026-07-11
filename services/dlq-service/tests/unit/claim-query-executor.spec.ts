import { describe, expect, it, jest } from "@jest/globals";

describe("ClaimQueryExecutor", () => {
	let ClaimQueryExecutorClass: new () => {
		findClaimCandidates: (
			col: Record<string, unknown>,
			filter: Record<string, unknown>,
			limit: number,
			projection: Record<string, unknown>
		) => Promise<unknown[]>;
		executeBulkClaim: (req: Record<string, unknown>) => Promise<unknown[]>;
		fetchClaimedByIds: (
			col: Record<string, unknown>,
			ids: unknown[],
			batchId: string,
			projection: Record<string, unknown>
		) => Promise<unknown[]>;
		claimByIds: (
			col: Record<string, unknown>,
			ids: unknown[],
			ctx: Record<string, unknown>,
			buildAtomicCondition: () => Record<string, unknown>
		) => Promise<void>;
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/dlq/claim-query-executor") as {
			ClaimQueryExecutor: typeof ClaimQueryExecutorClass;
		};
		ClaimQueryExecutorClass = mod.ClaimQueryExecutor;
	});

	it("should find claim candidates", async () => {
		const mockDocs = [{ _id: "1" }];
		const col = {
			find: jest.fn(() => ({
				toArray: jest.fn().mockResolvedValue(mockDocs),
			})),
		};

		const executor = new ClaimQueryExecutorClass();
		const result = await executor.findClaimCandidates(
			col as never,
			{ status: "pending" },
			10,
			{ _id: 1 }
		);

		expect(result).toEqual(mockDocs);
		expect(col.find).toHaveBeenCalledWith(
			{ status: "pending" },
			{ sort: { createdAt: -1 }, limit: 10, projection: { _id: 1 } }
		);
	});

	it("should execute bulk claim and return claimed entries", async () => {
		const mockCandidates = [{ _id: "id1" }, { _id: "id2" }];
		const mockClaimed = [{ _id: "id1", lastBatchId: "batch-1" }];
		const col = {
			bulkWrite: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
			find: jest.fn(() => ({
				toArray: jest.fn().mockResolvedValue(mockClaimed),
			})),
		};
		const buildBulkUpdateOps = jest.fn(() => []);

		const executor = new ClaimQueryExecutorClass();
		const result = await executor.executeBulkClaim({
			col: col as never,
			candidates: mockCandidates as never,
			batchId: "batch-1",
			instanceId: "instance-1",
			claimProjection: { _id: 1 },
			buildBulkUpdateOps,
		});

		expect(result).toEqual(mockClaimed);
		expect(buildBulkUpdateOps).toHaveBeenCalledWith(
			mockCandidates,
			expect.any(Date),
			"instance-1",
			"batch-1"
		);
	});

	it("should return empty when no documents modified", async () => {
		const col = {
			bulkWrite: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
		};

		const executor = new ClaimQueryExecutorClass();
		const result = await executor.executeBulkClaim({
			col: col as never,
			candidates: [{ _id: "id1" }] as never,
			batchId: "batch-1",
			instanceId: "instance-1",
			claimProjection: { _id: 1 },
			buildBulkUpdateOps: jest.fn(() => []),
		});

		expect(result).toEqual([]);
	});

	it("should fetch claimed by IDs", async () => {
		const mockDocs = [{ _id: "id1", lastBatchId: "batch-1" }];
		const col = {
			find: jest.fn(() => ({
				toArray: jest.fn().mockResolvedValue(mockDocs),
			})),
		};

		const executor = new ClaimQueryExecutorClass();
		const result = await executor.fetchClaimedByIds(
			col as never,
			["id1"] as never,
			"batch-1",
			{ _id: 1 }
		);

		expect(result).toEqual(mockDocs);
		expect(col.find).toHaveBeenCalledWith(
			{ _id: { $in: ["id1"] }, lastBatchId: "batch-1" },
			{ projection: { _id: 1 } }
		);
	});

	it("should claim by IDs", async () => {
		const col = {
			bulkWrite: jest.fn().mockResolvedValue({}),
		};
		const buildAtomicCondition = jest.fn(() => ({ status: "pending" }));

		const executor = new ClaimQueryExecutorClass();
		await executor.claimByIds(
			col as never,
			["id1", "id2"] as never,
			{ batchId: "batch-1", instanceId: "instance-1" } as never,
			buildAtomicCondition
		);

		expect(col.bulkWrite).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					updateOne: expect.objectContaining({
						filter: { _id: "id1", status: "pending" },
					}),
				}),
			]),
			{ ordered: false }
		);
	});
});
