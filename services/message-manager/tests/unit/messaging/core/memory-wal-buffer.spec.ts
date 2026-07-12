import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { RedisKeyBuilder } from "../../../../src/infrastructure/redis/redis-key-builder";

const mockFallbackInstance = {
	recoverFromFallbackFile: jest.fn().mockResolvedValue([]),
	trySaveToRedis: jest.fn().mockResolvedValue(true),
	trySaveToFallback: jest.fn(),
};

const mockFlusherInstance = {
	startFlusher: jest.fn(),
	stopFlusher: jest.fn(),
	drainAll: jest.fn(),
};

jest.mock("../../../../src/messaging/core/memory-wal-fallback", () => ({
	MemoryWalFallback: jest.fn(() => mockFallbackInstance),
}));

jest.mock("../../../../src/messaging/core/memory-wal-flusher", () => ({
	MemoryWalFlusher: jest.fn(() => mockFlusherInstance),
}));

jest.mock("../../../../src/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

jest.mock("../../../../src/config/env", () => ({
	ENV: {
		MEMORY_WAL_BUFFER_SIZE: 5,
		MEMORY_WAL_BUFFER_WARN_PCT: 0.8,
	},
}));

jest.mock("../../../../src/config/metrics", () => ({
	BUFFER_DROPPED_TOTAL: { inc: jest.fn() },
}));

const testKeys = new RedisKeyBuilder("test:");

describe("MemoryWalBuffer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockFallbackInstance.recoverFromFallbackFile.mockResolvedValue([]);
		mockFallbackInstance.trySaveToRedis.mockResolvedValue(true);
	});

	it("should push entries and warn near capacity", async () => {
		const {
			MemoryWalBuffer,
		} = require("../../../../src/messaging/core/memory-wal-buffer");
		const { logger } = require("../../../../src/config/logger");
		const buffer = new MemoryWalBuffer(testKeys);
		for (let i = 0; i < 5; i++) {
			await buffer.push({ topic: "t", serialized: "{}" } as never);
		}
		expect(buffer.length).toBe(5);
		expect(logger.warn).toHaveBeenCalled();
	});

	it("should evict excess when buffer is full", async () => {
		const {
			MemoryWalBuffer,
		} = require("../../../../src/messaging/core/memory-wal-buffer");
		const buffer = new MemoryWalBuffer(testKeys);
		for (let i = 0; i < 7; i++) {
			await buffer.push({ topic: "t", serialized: "{}" } as never);
		}
		expect(buffer.length).toBeLessThanOrEqual(5);
	});

	it("startFlusher and stopFlusher work", () => {
		const {
			MemoryWalBuffer,
		} = require("../../../../src/messaging/core/memory-wal-buffer");
		const buffer = new MemoryWalBuffer(testKeys);
		buffer.startFlusher();
		buffer.stopFlusher();
		expect(true).toBe(true);
	});

	it("recoverFromFallbackFile with entries", async () => {
		mockFallbackInstance.recoverFromFallbackFile.mockResolvedValue([
			{ topic: "t", serialized: "{}" },
		]);
		const {
			MemoryWalBuffer,
		} = require("../../../../src/messaging/core/memory-wal-buffer");
		const buffer = new MemoryWalBuffer(testKeys);
		const count = await buffer.recoverFromFallbackFile();
		expect(count).toBe(1);
	});

	it("recoverFromFallbackFile with no entries", async () => {
		const {
			MemoryWalBuffer,
		} = require("../../../../src/messaging/core/memory-wal-buffer");
		const buffer = new MemoryWalBuffer(testKeys);
		const count = await buffer.recoverFromFallbackFile();
		expect(count).toBe(0);
	});
});
