import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/config/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

describe("IndexManager", () => {
	let IndexManagerClass: new () => {
		createCollectionIndexes: (col: {
			createIndex: jest.Mock<(...args: any[]) => any>;
		}) => Promise<string[]>;
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/config/index-manager") as {
			IndexManager: typeof IndexManagerClass;
		};
		IndexManagerClass = mod.IndexManager;
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should create all 11 indexes and return no missing critical indexes on success", async () => {
		const mockCreateIndex = jest
			.fn<(...args: any[]) => any>()
			.mockResolvedValue("some-index-name");
		const col = { createIndex: mockCreateIndex };

		const manager = new IndexManagerClass();
		const result = await manager.createCollectionIndexes(col as never);

		expect(mockCreateIndex).toHaveBeenCalledTimes(11);
		expect(result).toEqual([]);
	});

	it("should return missing critical indexes on failure", async () => {
		const mockCreateIndex = jest
			.fn<(...args: any[]) => any>()
			.mockRejectedValue(new Error("index error"));
		const col = { createIndex: mockCreateIndex };
		const logger = jest.requireMock("../../src/config/logger") as {
			logger: {
				error: jest.Mock<(...args: any[]) => any>;
				warn: jest.Mock<(...args: any[]) => any>;
			};
		};

		const manager = new IndexManagerClass();
		const result = await manager.createCollectionIndexes(col as never);

		expect(result.length).toBeGreaterThan(0);
		expect(logger.logger.error).toHaveBeenCalled();
	});

	it("should warn on non-critical index failure", async () => {
		const logger = jest.requireMock("../../src/config/logger") as {
			logger: {
				error: jest.Mock<(...args: any[]) => any>;
				warn: jest.Mock<(...args: any[]) => any>;
			};
		};

		const mockCreateIndex = jest
			.fn<(...args: any[]) => any>()
			.mockRejectedValueOnce(new Error("critical fail"))
			.mockRejectedValueOnce(new Error("critical fail"))
			.mockRejectedValueOnce(new Error("critical fail"))
			.mockRejectedValueOnce(new Error("critical fail"))
			.mockRejectedValue(new Error("non-critical fail"));
		const col = { createIndex: mockCreateIndex };

		const manager = new IndexManagerClass();
		const result = await manager.createCollectionIndexes(col as never);

		expect(result.length).toBeGreaterThanOrEqual(1);
		expect(logger.logger.warn).toHaveBeenCalled();
	});
});
