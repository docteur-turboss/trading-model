import { describe, expect, it, jest } from "@jest/globals";

const MOCK_GET_CLIENT = jest.fn();
const MOCK_IS_AVAILABLE = jest.fn();
const MOCK_CONNECT = jest.fn();
const MOCK_CLOSE = jest.fn();

jest.mock("../../src/config/env", () => ({
	ENV: {
		REDIS_URL: "redis://localhost:6379",
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/config/redis-connection", () => ({
	RedisConnection: jest.fn(() => ({
		getClient: MOCK_GET_CLIENT,
		isAvailable: MOCK_IS_AVAILABLE,
		connect: MOCK_CONNECT,
		close: MOCK_CLOSE,
	})),
}));

describe("DlqRedisQueue", () => {
	let DlqRedisQueueClass: new (
		queueKey?: string
	) => {
		connect: (onReconnect?: () => void) => Promise<boolean>;
		push: (entryId: string, maxQueueSize?: number) => Promise<boolean>;
		pop: () => Promise<string | null>;
		isAvailable: () => boolean;
		close: () => Promise<void>;
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/config/redis-queue");
		DlqRedisQueueClass = mod.DlqRedisQueue;
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("connect", () => {
		it("should delegate to RedisConnection.connect", async () => {
			MOCK_CONNECT.mockResolvedValue(true);
			const queue = new DlqRedisQueueClass();
			const result = await queue.connect(() => {});
			expect(result).toBe(true);
			expect(MOCK_CONNECT).toHaveBeenCalled();
		});
	});

	describe("push", () => {
		it("should return false when not connected", async () => {
			MOCK_GET_CLIENT.mockReturnValue(null);
			MOCK_IS_AVAILABLE.mockReturnValue(false);
			const queue = new DlqRedisQueueClass();
			const result = await queue.push("entry-1");
			expect(result).toBe(false);
		});

		it("should return false when client is null", async () => {
			MOCK_GET_CLIENT.mockReturnValue(null);
			MOCK_IS_AVAILABLE.mockReturnValue(true);
			const queue = new DlqRedisQueueClass();
			const result = await queue.push("entry-1");
			expect(result).toBe(false);
		});

		it("should push entry to redis queue", async () => {
			const mockClient = {
				llen: jest.fn().mockResolvedValue(10),
				lpush: jest.fn().mockResolvedValue(1),
			};
			MOCK_GET_CLIENT.mockReturnValue(mockClient);
			MOCK_IS_AVAILABLE.mockReturnValue(true);

			const queue = new DlqRedisQueueClass();
			const result = await queue.push("entry-1");

			expect(result).toBe(true);
			expect(mockClient.llen).toHaveBeenCalledWith("dlq:queue");
			expect(mockClient.lpush).toHaveBeenCalledWith("dlq:queue", "entry-1");
		});

		it("should return false when queue size limit is reached", async () => {
			const mockClient = {
				llen: jest.fn().mockResolvedValue(50000),
				lpush: jest.fn(),
			};
			MOCK_GET_CLIENT.mockReturnValue(mockClient);
			MOCK_IS_AVAILABLE.mockReturnValue(true);

			const queue = new DlqRedisQueueClass();
			const result = await queue.push("entry-1");

			expect(result).toBe(false);
			expect(mockClient.lpush).not.toHaveBeenCalled();
		});

		it("should handle redis error gracefully", async () => {
			const mockClient = {
				llen: jest.fn().mockRejectedValue(new Error("redis down")),
				lpush: jest.fn(),
			};
			MOCK_GET_CLIENT.mockReturnValue(mockClient);
			MOCK_IS_AVAILABLE.mockReturnValue(true);

			const queue = new DlqRedisQueueClass();
			const result = await queue.push("entry-1");

			expect(result).toBe(false);
		});
	});

	describe("pop", () => {
		it("should return null when not connected", async () => {
			MOCK_GET_CLIENT.mockReturnValue(null);
			MOCK_IS_AVAILABLE.mockReturnValue(false);
			const queue = new DlqRedisQueueClass();
			const result = await queue.pop();
			expect(result).toBeNull();
		});

		it("should return entry from redis queue", async () => {
			const mockClient = {
				script: jest.fn().mockResolvedValue("hash123"),
				evalsha: jest.fn().mockResolvedValue(["entry-1"]),
			};
			MOCK_GET_CLIENT.mockReturnValue(mockClient);
			MOCK_IS_AVAILABLE.mockReturnValue(true);

			const queue = new DlqRedisQueueClass();
			const result = await queue.pop();

			expect(result).toBe("entry-1");
			expect(mockClient.script).toHaveBeenCalledWith(
				"LOAD",
				expect.any(String)
			);
			expect(mockClient.evalsha).toHaveBeenCalledWith(
				"hash123",
				1,
				"dlq:queue"
			);
		});

		it("should return null when no entries", async () => {
			const mockClient = {
				script: jest.fn().mockResolvedValue("hash123"),
				evalsha: jest.fn().mockResolvedValue([]),
			};
			MOCK_GET_CLIENT.mockReturnValue(mockClient);
			MOCK_IS_AVAILABLE.mockReturnValue(true);

			const queue = new DlqRedisQueueClass();
			const result = await queue.pop();

			expect(result).toBeNull();
		});

		it("should handle redis error gracefully", async () => {
			const mockClient = {
				script: jest.fn().mockRejectedValue(new Error("script error")),
				evalsha: jest.fn(),
			};
			MOCK_GET_CLIENT.mockReturnValue(mockClient);
			MOCK_IS_AVAILABLE.mockReturnValue(true);

			const queue = new DlqRedisQueueClass();
			const result = await queue.pop();

			expect(result).toBeNull();
		});
	});

	describe("isAvailable", () => {
		it("should return false when not connected", () => {
			MOCK_IS_AVAILABLE.mockReturnValue(false);
			const queue = new DlqRedisQueueClass();
			expect(queue.isAvailable()).toBe(false);
		});

		it("should return true when connected", () => {
			MOCK_IS_AVAILABLE.mockReturnValue(true);
			const queue = new DlqRedisQueueClass();
			expect(queue.isAvailable()).toBe(true);
		});
	});

	describe("close", () => {
		it("should delegate to RedisConnection.close", async () => {
			MOCK_CLOSE.mockResolvedValue(undefined);
			const queue = new DlqRedisQueueClass();
			await queue.close();
			expect(MOCK_CLOSE).toHaveBeenCalled();
		});
	});
});
