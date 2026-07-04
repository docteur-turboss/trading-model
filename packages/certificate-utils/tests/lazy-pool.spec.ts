import { describe, expect, it, jest } from "@jest/globals";

jest.mock("node:worker_threads", () => {
	const FakeWorker = jest.fn().mockImplementation(() => ({
		on: jest.fn(),
		postMessage: jest.fn(),
		terminate: jest.fn(),
		removeAllListeners: jest.fn(),
	}));
	return { Worker: FakeWorker };
});

jest.mock("node:os", () => ({
	availableParallelism: jest.fn(() => 2),
}));

describe("lazy-pool", () => {
	it("should create and return a WorkerPool singleton", () => {
		jest.isolateModules(() => {
			const { getPool } = require("../src/lazy-pool");
			const pool1 = getPool();
			const pool2 = getPool();
			expect(pool1).toBe(pool2);
		});
	});

	it("should create pool with custom size", () => {
		jest.isolateModules(() => {
			const { getPool } = require("../src/lazy-pool");
			const pool = getPool(4);
			expect(pool).toBeDefined();
		});
	});

	it("warmupPool should start the pool", () => {
		jest.isolateModules(() => {
			const { getPool, warmupPool } = require("../src/lazy-pool");
			warmupPool(2);
			const p = getPool();
			expect(p.size).toBe(2);
		});
	});
});
