import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../../src/config/redis", () => ({
	getStreamClient: jest.fn(),
}));

import { getStreamClient } from "../../../../src/config/redis";
import { MemoryWalFlusher } from "../../../../src/messaging/core/memory-wal-flusher";

function createMockRedis() {
	const mockMulti = {
		xadd: jest.fn().mockReturnThis(),
		expire: jest.fn().mockReturnThis(),
		exec: jest.fn().mockResolvedValue([
			[null, "OK"],
			[null, 1],
		]),
	};
	return {
		multi: jest.fn(() => mockMulti),
		status: "ready",
		ping: jest.fn().mockResolvedValue("PONG"),
		mockMulti,
	};
}

describe("MemoryWalFlusher", () => {
	let flusher: MemoryWalFlusher;
	let mockRedis: ReturnType<typeof createMockRedis>;

	beforeEach(() => {
		mockRedis = createMockRedis();
		(getStreamClient as jest.Mock<() => Promise<unknown>>).mockResolvedValue(
			mockRedis
		);
		flusher = new MemoryWalFlusher("test:", 1000, 3600);
	});

	it("should have zero buffer on init", () => {
		expect(flusher.bufferSize).toBe(0);
	});

	it("should increase buffer on push", () => {
		flusher.push([{ topic: "test.topic", serialized: '{"hello":"world"}' }]);
		expect(flusher.bufferSize).toBe(1);
	});

	it("should flush entries to Redis", async () => {
		flusher.push([{ topic: "test.topic", serialized: '{"hello":"world"}' }]);

		await flusher.flush();

		expect(mockRedis.multi).toHaveBeenCalled();
		expect(mockRedis.mockMulti.xadd).toHaveBeenCalledWith(
			"test:stream:test.topic",
			"MAXLEN",
			"~",
			1000,
			"*",
			"data",
			'{"hello":"world"}'
		);
		expect(mockRedis.mockMulti.expire).toHaveBeenCalledWith(
			"test:stream:test.topic",
			3600
		);
		expect(mockRedis.mockMulti.exec).toHaveBeenCalled();
	});

	it("should not flush when already flushing", async () => {
		flusher.push([{ topic: "test.topic", serialized: "{}" }]);

		await Promise.all([flusher.flush(), flusher.flush()]);

		expect(mockRedis.multi).toHaveBeenCalledTimes(1);
	});

	it("should clear buffer after successful flush", async () => {
		flusher.push([{ topic: "test.topic", serialized: "{}" }]);

		await flusher.flush();
		expect(flusher.bufferSize).toBe(0);
	});

	it("should re-queue batch on exec error", async () => {
		mockRedis.mockMulti.exec.mockRejectedValue(new Error("redis down"));

		flusher.push([{ topic: "test.topic", serialized: "{}" }]);

		await flusher.flush();

		expect(flusher.bufferSize).toBe(1);
	});

	it("should re-queue batch on partial failure", async () => {
		mockRedis.mockMulti.exec.mockResolvedValue([[new Error("fail"), null]]);

		flusher.push([{ topic: "test.topic", serialized: "{}" }]);

		await flusher.flush();

		expect(flusher.bufferSize).toBe(1);
	});

	it("should handle empty buffer", async () => {
		await flusher.flush();

		expect(mockRedis.multi).not.toHaveBeenCalled();
	});

	it("should skip flush when redis was recently down", async () => {
		mockRedis.mockMulti.exec.mockRejectedValue(new Error("redis down"));

		flusher.push([{ topic: "test.topic", serialized: "{}" }]);

		await flusher.flush();

		expect(flusher.bufferSize).toBe(1);

		await flusher.flush();

		expect(mockRedis.multi).toHaveBeenCalledTimes(1);
	});
});
