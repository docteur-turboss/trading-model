import { describe, expect, it, jest } from "@jest/globals";

const mockToArray = jest.fn();
const mockDeleteMany = jest.fn();
const mockFind = jest.fn(() => ({ toArray: mockToArray }));
const mockCollection = jest.fn(() => ({
	find: mockFind,
	deleteMany: mockDeleteMany,
}));

jest.mock("../../src/config/db", () => ({
	getCollection: mockCollection,
}));

describe("dlq-eviction-policy", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return 0 if no documents to prune", async () => {
		mockToArray.mockResolvedValue([]);

		const { pruneEntries } = jest.requireActual(
			"../../src/domain/dlq-eviction-policy"
		) as { pruneEntries: (max: number) => Promise<number> };
		const result = await pruneEntries(100);
		expect(result).toBe(0);
	});

	it("should delete documents older than the eldest kept entry", async () => {
		const eldestDate = new Date("2024-06-01");
		mockToArray.mockResolvedValue([{ createdAt: eldestDate }]);
		mockDeleteMany.mockResolvedValue({ deletedCount: 50 });

		const { pruneEntries } = jest.requireActual(
			"../../src/domain/dlq-eviction-policy"
		) as { pruneEntries: (max: number) => Promise<number> };
		const result = await pruneEntries(100);
		expect(result).toBe(50);
		expect(mockDeleteMany).toHaveBeenCalledWith({
			createdAt: { $lt: eldestDate },
			processingAt: { $exists: false },
		});
	});
});
