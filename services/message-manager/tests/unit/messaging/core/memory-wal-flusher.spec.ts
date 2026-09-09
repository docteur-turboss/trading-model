import { describe, expect, it, jest } from "@jest/globals";
import {
	REDIS_RESP,
	REDIS_STATUS,
} from "@trading-model/common/persistence/redis-constants";

jest.mock("../../../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../../src/infrastructure/config/env", () => ({
	ENV: {
		REDIS_STREAM_MAXLEN: 1000,
		REDIS_MESSAGE_TTL_S: 3600,
	},
}));

jest.mock("../../../../src/config/redis", () => ({
	getStreamClient: jest.fn(),
}));

import { getStreamClient } from "../../../../src/config/redis";
import { RedisKeyBuilder } from "../../../../src/infrastructure/redis/redis-key-builder";
import type { MemoryWalEntry } from "../../../../src/messaging/core/memory-wal-entry";
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
		status: REDIS_STATUS.READY,
		ping: jest.fn().mockResolvedValue(REDIS_RESP.PONG),
		mockMulti,
	};
}

function makeEntry(overrides?: Partial<MemoryWalEntry>): MemoryWalEntry {
	return {
		topic: "test.topic",
		serialized: '{"hello":"world"}',
		message: {
			type: "test",
		} as unknown as import("@trading-model/validation/domain/contracts/message.types").Message,
		...overrides,
	};
}

describe("MemoryWalFlusher", () => {
	let flusher: MemoryWalFlusher;
	let buffer: MemoryWalEntry[];
	let mockRedis: ReturnType<typeof createMockRedis>;

	beforeEach(() => {
		mockRedis = createMockRedis();
		(getStreamClient as jest.Mock<() => Promise<unknown>>).mockResolvedValue(
			mockRedis
		);
		flusher = new MemoryWalFlusher(new RedisKeyBuilder("test:"));
		buffer = [];
	});

	it("should flush entries to Redis", async () => {
		buffer.push(makeEntry());

		await flusher.flush(buffer);

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

	it("should clear buffer after successful flush", async () => {
		buffer.push(makeEntry());

		await flusher.flush(buffer);
		expect(buffer.length).toBe(0);
	});

	it("should not flush when already flushing", async () => {
		buffer.push(makeEntry());

		await Promise.all([flusher.flush(buffer), flusher.flush(buffer)]);

		expect(mockRedis.multi).toHaveBeenCalledTimes(1);
	});

	it("should re-queue batch on exec error", async () => {
		mockRedis.mockMulti.exec.mockRejectedValue(new Error("redis down"));

		buffer.push(makeEntry());

		await flusher.flush(buffer);

		expect(buffer.length).toBe(1);
	});

	it("should re-queue batch on partial failure", async () => {
		mockRedis.mockMulti.exec.mockResolvedValue([[new Error("fail"), null]]);

		buffer.push(makeEntry());

		await flusher.flush(buffer);

		expect(buffer.length).toBe(1);
	});

	it("should handle empty buffer", async () => {
		await flusher.flush(buffer);

		expect(mockRedis.multi).not.toHaveBeenCalled();
	});

	it("should skip flush when redis was recently down", async () => {
		mockRedis.mockMulti.exec.mockRejectedValue(new Error("redis down"));

		buffer.push(makeEntry());

		await flusher.flush(buffer);

		expect(buffer.length).toBe(1);

		await flusher.flush(buffer);

		expect(mockRedis.multi).toHaveBeenCalledTimes(1);
	});
});
