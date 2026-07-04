import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { PersistenceRetryQueue } from "../../../../src/messaging/core/persistence-queue";

describe("PersistenceRetryQueue extras", () => {
	it("should not start new timer when already running", () => {
		const queue = new PersistenceRetryQueue(3, 1000);
		const fn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
		queue.enqueue(fn, "op1");
		queue.enqueue(fn, "op2");

		expect(fn).not.toHaveBeenCalled();
	});

	it("should handle enqueue after flush with empty ops", async () => {
		const queue = new PersistenceRetryQueue(3, 1000);

		const fn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
		queue.enqueue(fn, "op1");
		await queue.flush();

		const spy = jest.spyOn(globalThis, "clearInterval");

		queue.enqueue(fn, "op2");
		await queue.flush();

		spy.mockRestore();
	});
});
