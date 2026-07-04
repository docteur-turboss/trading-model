import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/config/env", () => ({
	env: {
		REDIS_URL: "redis://localhost:6379",
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("DlqRedisQueue", () => {
	let DlqRedisQueueClass: new (
		queueKey?: string
	) => {
		connect: () => Promise<boolean>;
		push: (entryId: string, maxQueueSize?: number) => Promise<boolean>;
		pop: () => Promise<string | null>;
		isAvailable: () => boolean;
		close: () => Promise<void>;
		setOnReconnect: (cb: () => void) => void;
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/config/redis-queue");
		DlqRedisQueueClass = mod.DlqRedisQueue;
	});

	describe("push", () => {
		it("should return false when not connected", async () => {
			const queue = new DlqRedisQueueClass();
			const result = await queue.push("entry-1");
			expect(result).toBe(false);
		});
	});

	describe("pop", () => {
		it("should return null when not connected", async () => {
			const queue = new DlqRedisQueueClass();
			const result = await queue.pop();
			expect(result).toBeNull();
		});
	});

	describe("isAvailable", () => {
		it("should return false when not connected", () => {
			const queue = new DlqRedisQueueClass();
			expect(queue.isAvailable()).toBe(false);
		});
	});
});
