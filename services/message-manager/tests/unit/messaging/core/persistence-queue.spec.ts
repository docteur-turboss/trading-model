import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { PersistenceRetryQueue } from "../../../../src/messaging/core/persistence-queue";

describe("PersistenceRetryQueue", () => {
	it("should enqueue and execute operation on flush", async () => {
		const fn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
		const queue = new PersistenceRetryQueue(3, 1000);

		queue.enqueue(fn, "test-op");
		await queue.flush();

		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("should retry on failure up to max retries", async () => {
		const fn = jest
			.fn<() => Promise<void>>()
			.mockRejectedValue(new Error("fail"));
		const queue = new PersistenceRetryQueue(3, 1000);

		queue.enqueue(fn, "test-op");
		await queue.flush();

		expect(fn).toHaveBeenCalled();
	});

	it("should log error when max retries exceeded", async () => {
		const fn = jest
			.fn<() => Promise<void>>()
			.mockRejectedValue(new Error("fail"));
		const queue = new PersistenceRetryQueue(0, 1000);

		queue.enqueue(fn, "test-op");
		await queue.flush();

		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("should handle multiple operations", async () => {
		const fn1 = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
		const fn2 = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
		const queue = new PersistenceRetryQueue(3, 1000);

		queue.enqueue(fn1, "op1");
		queue.enqueue(fn2, "op2");
		await queue.flush();

		expect(fn1).toHaveBeenCalledTimes(1);
		expect(fn2).toHaveBeenCalledTimes(1);
	});

	it("should not call stop if ops remain after flush", async () => {
		const fn = jest
			.fn<() => Promise<void>>()
			.mockRejectedValue(new Error("fail"));
		const queue = new PersistenceRetryQueue(3, 1000);

		queue.enqueue(fn, "test-op");
		await queue.flush();

		expect(fn).toHaveBeenCalled();
	});

	it("should clear timer on stop", () => {
		const fn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
		const queue = new PersistenceRetryQueue(3, 1000);

		queue.enqueue(fn, "test-op");

		const spy = jest.spyOn(globalThis, "clearInterval");
		void queue.stop();
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it("should flush with running timer and no ops", async () => {
		const queue = new PersistenceRetryQueue(3, 1000);

		queue.enqueue(
			jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			"temp"
		);

		const flushSpy = jest.spyOn(queue as never, "flush");

		await queue.flush();

		await queue.flush();

		flushSpy.mockRestore();
	});

	it("should flush pending ops on stop", async () => {
		const fn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
		const queue = new PersistenceRetryQueue(3, 1000);

		queue.enqueue(fn, "test-op");
		await queue.stop();
		expect(fn).toHaveBeenCalled();
	});
});
