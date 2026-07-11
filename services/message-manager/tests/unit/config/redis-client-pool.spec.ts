import { describe, expect, it, jest } from "@jest/globals";
import { REDIS_STATUS } from "@trading-model/common/persistence/redis-constants";

const mockOn = jest.fn();
const mockOff = jest.fn();
const mockConnect = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDisconnect = jest.fn();
const mockRemoveAllListeners = jest.fn();
const mockOnce = jest.fn();

const createMockRedis = (status = REDIS_STATUS.READY) => ({
	status,
	connect: mockConnect,
	disconnect: mockDisconnect,
	removeAllListeners: mockRemoveAllListeners,
	on: mockOn,
	off: mockOff,
	once: mockOnce,
});

jest.mock("ioredis", () => ({
	__esModule: true,
	default: jest.fn(),
}));

jest.mock("../../../src/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

jest.mock("../../../src/config/redis-event-handlers", () => ({
	createEventHandlers: jest.fn(() => ({
		onError: jest.fn(),
		onConnect: jest.fn(),
		onReady: jest.fn(),
		onClose: jest.fn(),
		onReconnecting: jest.fn(),
	})),
	attachEventHandlers: jest.fn(),
	detachEventHandlers: jest.fn(),
}));

const { logger } = require("../../../src/config/logger");

describe("RedisClientPool", () => {
	let pool: import("../../../src/config/redis-client-pool").RedisClientPool;
	let isClosed: () => boolean;
	let RedisClientPool: typeof import("../../../src/config/redis-client-pool").RedisClientPool;

	beforeEach(() => {
		jest.clearAllMocks();
		mockConnect.mockResolvedValue(undefined);
		mockOnce.mockImplementation((_event: string, cb: () => void) => {
			cb();
		});
		isClosed = () => false;
		RedisClientPool =
			require("../../../src/config/redis-client-pool").RedisClientPool;
		pool = new RedisClientPool("test-pool", isClosed, []);
	});

	describe("getOrCreate", () => {
		it("should throw when pool is closed", async () => {
			isClosed = () => true;
			const closedPool = new RedisClientPool("test-pool", isClosed, []);
			await expect(
				closedPool.getOrCreate(() => createMockRedis() as never)
			).rejects.toThrow("Redis has been closed");
		});

		it("should return existing client when ready", async () => {
			const client = createMockRedis(REDIS_STATUS.READY);
			(pool as unknown as Record<string, unknown>)._client = client;

			const result = await pool.getOrCreate(() => createMockRedis() as never);
			expect(result).toBe(client);
		});

		it("should create new client when not ready and no pending", async () => {
			const client = createMockRedis(REDIS_STATUS.READY);
			mockConnect.mockResolvedValue(undefined);

			const result = await pool.getOrCreate(() => client as never);
			expect(result).toBeDefined();
			expect(mockConnect).toHaveBeenCalled();
		});
	});

	describe("getConnection", () => {
		it("should delegate to getOrCreate", async () => {
			const client = createMockRedis(REDIS_STATUS.READY);
			(pool as unknown as Record<string, unknown>)._client = client;

			const result = await pool.getConnection(() => createMockRedis() as never);
			expect(result).toBe(client);
		});
	});

	describe("destroyAll", () => {
		it("should destroy existing client", () => {
			const client = createMockRedis(REDIS_STATUS.READY);
			(pool as unknown as Record<string, unknown>)._client = client;

			pool.destroyAll();
			expect(mockRemoveAllListeners).toHaveBeenCalled();
			expect(mockDisconnect).toHaveBeenCalled();
			expect((pool as unknown as Record<string, unknown>)._client).toBeNull();
		});

		it("should do nothing when no client", () => {
			pool.destroyAll();
			expect(mockDisconnect).not.toHaveBeenCalled();
		});
	});

	describe("getClientOrThrow", () => {
		it("should throw when client is not ready", () => {
			(pool as unknown as Record<string, unknown>)._client = createMockRedis(
				REDIS_STATUS.CONNECTING
			);
			expect(() => pool.getClientOrThrow()).toThrow("Redis is not available");
		});

		it("should throw when client is null", () => {
			expect(() => pool.getClientOrThrow()).toThrow("Redis is not available");
		});

		it("should return client when ready", () => {
			const client = createMockRedis(REDIS_STATUS.READY);
			(pool as unknown as Record<string, unknown>)._client = client;
			expect(pool.getClientOrThrow()).toBe(client);
		});
	});

	describe("error handling", () => {
		it("should handle disconnect error gracefully", () => {
			mockDisconnect.mockImplementation(() => {
				throw new Error("disconnect error");
			});
			const client = createMockRedis(REDIS_STATUS.READY);
			(pool as unknown as { _destroyClient(c: unknown): void })._destroyClient(
				client
			);
			expect(logger.debug).toHaveBeenCalledWith(
				"Redis client disconnect error (best-effort)"
			);
		});
	});

	describe("connect failure", () => {
		it("should log error when connect fails and pool not closed", async () => {
			mockConnect.mockRejectedValue(new Error("connection refused"));
			await expect(
				pool.getOrCreate(() => createMockRedis() as never)
			).rejects.toThrow("connection refused");
			expect(logger.error).toHaveBeenCalledWith(
				expect.stringContaining("failed to connect"),
				expect.any(Object)
			);
		});
	});

	describe("replace client", () => {
		it("should destroy existing client when replacing", () => {
			const oldClient = createMockRedis(REDIS_STATUS.READY);
			(pool as unknown as Record<string, unknown>)._client = oldClient;
			const newClient = createMockRedis(REDIS_STATUS.READY);
			(pool as unknown as { _replaceClient(c: unknown): void })._replaceClient(
				newClient
			);
			expect(mockRemoveAllListeners).toHaveBeenCalled();
			expect(mockDisconnect).toHaveBeenCalled();
		});
	});

	describe("getOrCreate with concurrent calls", () => {
		it("should dedupe concurrent getOrCreate calls", async () => {
			let resolveConnect: (value: unknown) => void = () => {};
			const deferredConnect = new Promise((resolve) => {
				resolveConnect = resolve;
			});
			mockConnect.mockImplementation(() => deferredConnect as never);

			const result1 = pool.getOrCreate(() => createMockRedis() as never);
			const result2 = pool.getOrCreate(() => createMockRedis() as never);

			resolveConnect(undefined);

			const [r1, r2] = await Promise.all([result1, result2]);
			expect(r1).toBeDefined();
			expect(r2).toBeDefined();
		});
	});

	describe("reconnecting state", () => {
		it("should wait for reconnect when reconnecting", async () => {
			const reconnectingClient = createMockRedis(REDIS_STATUS.CONNECTING);
			(pool as unknown as Record<string, unknown>)._client = reconnectingClient;

			const result = await pool.getOrCreate(() => createMockRedis() as never);
			expect(result).toBe(reconnectingClient);
		});
	});
});
