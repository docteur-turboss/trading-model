import { describe, expect, it, jest } from "@jest/globals";

const MOCK_GET_CLIENT = jest.fn<(...args: any[]) => any>();
const MOCK_IS_AVAILABLE = jest.fn<(...args: any[]) => any>();
const MOCK_CONNECT = jest.fn<(...args: any[]) => any>();
const MOCK_CLOSE = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		REDIS_URL: "redis://localhost:6379",
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("../../src/config/redis-connection", () => ({
	RedisConnection: jest.fn((..._args: any[]) => ({
		getClient: MOCK_GET_CLIENT,
		isAvailable: MOCK_IS_AVAILABLE,
		connect: MOCK_CONNECT,
		close: MOCK_CLOSE,
	})),
}));

const { logger: MOCK_LOGGER } = jest.requireMock("../../src/config/logger") as {
	logger: { error: jest.Mock<(...args: any[]) => any> };
};

describe("DlqRedisQueue", () => {
	let DlqRedisQueueClass: new (
		queueKey?: string
	) => {
		connect: (onReconnect?: () => void) => Promise<boolean>;
		push: (entryId: string, maxQueueSize?: number) => Promise<boolean>;
		pop: () => Promise<string | null>;
		popMany: (count: number) => Promise<string[]>;
		isAvailable: () => boolean;
		close: () => Promise<void>;
	};

	beforeAll(() => {
		const mod = jest.requireActual<
			typeof import("../../src/config/redis-queue")
		>("../../src/config/redis-queue");
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
				eval: jest.fn<(...args: any[]) => any>().mockResolvedValue([1, 10]),
			};
			MOCK_GET_CLIENT.mockReturnValue(mockClient);
			MOCK_IS_AVAILABLE.mockReturnValue(true);

			const queue = new DlqRedisQueueClass();
			const result = await queue.push("entry-1");

			expect(result).toBe(true);
			expect(mockClient.eval).toHaveBeenCalledWith(
				expect.stringContaining("LPUSH"),
				1,
				"dlq:queue",
				"entry-1",
				50_000
			);
		});

		it("should return false when queue size limit is reached", async () => {
			const mockClient = {
				eval: jest.fn<(...args: any[]) => any>().mockResolvedValue([0, 50_000]),
			};
			MOCK_GET_CLIENT.mockReturnValue(mockClient);
			MOCK_IS_AVAILABLE.mockReturnValue(true);

			const queue = new DlqRedisQueueClass();
			const result = await queue.push("entry-1");

			expect(result).toBe(false);
		});

		it("should handle redis error gracefully", async () => {
			const mockClient = {
				eval: jest
					.fn<(...args: any[]) => any>()
					.mockRejectedValue(new Error("redis down")),
			};
			MOCK_GET_CLIENT.mockReturnValue(mockClient);
			MOCK_IS_AVAILABLE.mockReturnValue(true);

			const queue = new DlqRedisQueueClass();
			const result = await queue.push("entry-1");

			expect(result).toBe(false);
			expect(MOCK_LOGGER.error).toHaveBeenCalledWith(
				"Redis queue push failed",
				expect.objectContaining({ entryId: "entry-1", error: "redis down" })
			);
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
				eval: jest.fn<(...args: any[]) => any>().mockResolvedValue(["entry-1"]),
			};
			MOCK_GET_CLIENT.mockReturnValue(mockClient);
			MOCK_IS_AVAILABLE.mockReturnValue(true);

			const queue = new DlqRedisQueueClass();
			const result = await queue.pop();

			expect(result).toBe("entry-1");
			expect(mockClient.eval).toHaveBeenCalledWith(
				expect.any(String),
				1,
				"dlq:queue",
				1
			);
		});

		it("popMany takes N entries in one eval, oldest first", async () => {
			const mockClient = {
				eval: jest
					.fn<(...args: any[]) => any>()
					.mockResolvedValue(["c", "b", "a"]),
			};
			MOCK_GET_CLIENT.mockReturnValue(mockClient);
			MOCK_IS_AVAILABLE.mockReturnValue(true);

			const result = await new DlqRedisQueueClass().popMany(3);

			expect(result).toEqual(["a", "b", "c"]);
			expect(mockClient.eval).toHaveBeenCalledTimes(1);
		});

		it("should return null when no entries", async () => {
			const mockClient = {
				eval: jest.fn<(...args: any[]) => any>().mockResolvedValue([]),
			};
			MOCK_GET_CLIENT.mockReturnValue(mockClient);
			MOCK_IS_AVAILABLE.mockReturnValue(true);

			const queue = new DlqRedisQueueClass();
			const result = await queue.pop();

			expect(result).toBeNull();
		});

		it("should handle redis error gracefully", async () => {
			const mockClient = {
				eval: jest
					.fn<(...args: any[]) => any>()
					.mockRejectedValue(new Error("script error")),
			};
			MOCK_GET_CLIENT.mockReturnValue(mockClient);
			MOCK_IS_AVAILABLE.mockReturnValue(true);

			const queue = new DlqRedisQueueClass();
			const result = await queue.pop();

			expect(result).toBeNull();
			expect(MOCK_LOGGER.error).toHaveBeenCalledWith(
				"Redis queue pop failed",
				expect.objectContaining({ error: "script error" })
			);
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
