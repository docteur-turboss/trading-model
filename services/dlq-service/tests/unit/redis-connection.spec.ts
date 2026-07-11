import { describe, expect, it, jest } from "@jest/globals";

const MOCK_CREATE_CLIENT = jest.fn();
const MOCK_GET_CLIENT = jest.fn();
const MOCK_CLOSE_CLIENT = jest.fn();
const MOCK_REMOVE_ALL_LISTENERS = jest.fn();

jest.mock("../../src/config/env", () => ({
	ENV: {
		REDIS_URL: "redis://localhost:6379",
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/config/redis-client-manager", () => ({
	RedisClientManager: jest.fn(() => ({
		createClient: MOCK_CREATE_CLIENT,
		getClient: MOCK_GET_CLIENT,
		closeClient: MOCK_CLOSE_CLIENT,
		removeAllListeners: MOCK_REMOVE_ALL_LISTENERS,
	})),
}));

describe("RedisConnection", () => {
	let RedisConnectionClass: new () => {
		connect: (onReconnect?: () => void) => Promise<boolean>;
		close: () => Promise<void>;
		isAvailable: () => boolean;
		getClient: () => unknown;
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/config/redis-connection") as {
			RedisConnection: typeof RedisConnectionClass;
		};
		RedisConnectionClass = mod.RedisConnection;
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should connect successfully", async () => {
		const mockRedisClient = {
			on: jest.fn(),
		};
		MOCK_CREATE_CLIENT.mockResolvedValue(mockRedisClient as never);
		MOCK_GET_CLIENT.mockReturnValue(null as never);

		const conn = new RedisConnectionClass();
		const result = await conn.connect();

		expect(result).toBe(true);
		expect(conn.isAvailable()).toBe(true);
	});

	it("should return true when already connected", async () => {
		const mockRedisClient = { on: jest.fn() };
		MOCK_CREATE_CLIENT.mockResolvedValue(mockRedisClient as never);
		MOCK_GET_CLIENT.mockReturnValueOnce(null as never).mockReturnValue(
			mockRedisClient as never
		);

		const conn = new RedisConnectionClass();
		await conn.connect();
		const result = await conn.connect();

		expect(result).toBe(true);
		expect(MOCK_CREATE_CLIENT).toHaveBeenCalledTimes(1);
	});

	it("should handle reconnection after close", async () => {
		const mockRedisClient = { on: jest.fn() };
		MOCK_CREATE_CLIENT.mockResolvedValue(mockRedisClient as never);
		MOCK_GET_CLIENT.mockReturnValueOnce(null as never).mockReturnValue(
			mockRedisClient as never
		);

		const conn = new RedisConnectionClass();
		await conn.connect();
		expect(conn.isAvailable()).toBe(true);

		await conn.close();
		expect(conn.isAvailable()).toBe(false);

		MOCK_GET_CLIENT.mockReturnValue(null as never);

		const result = await conn.connect();
		expect(result).toBe(true);
		expect(MOCK_CREATE_CLIENT).toHaveBeenCalledTimes(2);
	});

	it("should return false when REDIS_URL is not set", async () => {
		const envMock = jest.requireMock("../../src/config/env") as {
			ENV: { REDIS_URL: string };
		};
		envMock.ENV.REDIS_URL = "";
		MOCK_GET_CLIENT.mockReturnValue(null as never);

		const conn = new RedisConnectionClass();
		const result = await conn.connect();

		expect(result).toBe(false);

		envMock.ENV.REDIS_URL = "redis://localhost:6379";
	});

	it("should handle connect error for first connection", async () => {
		MOCK_CREATE_CLIENT.mockRejectedValue(new Error("connection refused"));
		MOCK_GET_CLIENT.mockReturnValue(null as never);

		const conn = new RedisConnectionClass();
		const result = await conn.connect();

		expect(result).toBe(false);
		expect(conn.isAvailable()).toBe(false);
	});

	it("should handle connect error for reconnection", async () => {
		const mockRedisClient = { on: jest.fn() };
		MOCK_CREATE_CLIENT.mockResolvedValueOnce(mockRedisClient as never);
		MOCK_GET_CLIENT.mockReturnValueOnce(null as never).mockReturnValue(
			mockRedisClient as never
		);

		const conn = new RedisConnectionClass();
		await conn.connect();
		await conn.close();

		MOCK_CREATE_CLIENT.mockRejectedValue(new Error("connection refused"));
		const result = await conn.connect();

		expect(result).toBe(false);
	});

	it("should close connection", async () => {
		const mockRedisClient = { on: jest.fn() };
		MOCK_CREATE_CLIENT.mockResolvedValue(mockRedisClient as never);
		MOCK_GET_CLIENT.mockReturnValueOnce(null as never).mockReturnValue(
			mockRedisClient as never
		);

		const conn = new RedisConnectionClass();
		await conn.connect();
		await conn.close();

		expect(MOCK_CLOSE_CLIENT).toHaveBeenCalled();
		expect(MOCK_REMOVE_ALL_LISTENERS).toHaveBeenCalled();
		expect(conn.isAvailable()).toBe(false);
	});

	it("should handle close when no client exists", async () => {
		MOCK_GET_CLIENT.mockReturnValue(null as never);

		const conn = new RedisConnectionClass();
		await conn.close();

		expect(MOCK_CLOSE_CLIENT).not.toHaveBeenCalled();
		expect(conn.isAvailable()).toBe(false);
	});

	it("should return client via getClient", () => {
		const mockClient = { on: jest.fn() };
		MOCK_GET_CLIENT.mockReturnValue(mockClient as never);

		const conn = new RedisConnectionClass();
		expect(conn.getClient()).toBe(mockClient);
	});

	it("should handle close of existing non-connected client before connect", async () => {
		const mockOldClient = { on: jest.fn() };
		const mockNewClient = { on: jest.fn() };
		MOCK_GET_CLIENT.mockReturnValueOnce(mockOldClient as never)
			.mockReturnValueOnce(mockOldClient as never)
			.mockReturnValueOnce(mockOldClient as never)
			.mockReturnValue(mockNewClient as never);
		MOCK_CREATE_CLIENT.mockResolvedValue(mockNewClient as never);

		const conn = new RedisConnectionClass();
		await conn.connect();

		expect(MOCK_CLOSE_CLIENT).toHaveBeenCalledWith();
	});

	it("should return false when already connecting", async () => {
		const mockClient = { on: jest.fn() };
		MOCK_CREATE_CLIENT.mockResolvedValue(mockClient as never);
		MOCK_GET_CLIENT.mockReturnValue(null as never);

		const conn = new RedisConnectionClass() as {
			connect: (onReconnect?: () => void) => Promise<boolean>;
			_state: string;
		};
		(conn as Record<string, unknown>)._state = "Connecting";

		const result = await conn.connect();

		expect(result).toBe(false);
	});

	describe("event handlers", () => {
		function makeClient(): { on: jest.Mock } & Record<string, unknown> {
			return { on: jest.fn() };
		}

		it("should attach event handlers during connect", async () => {
			const mockClient = makeClient();
			MOCK_CREATE_CLIENT.mockResolvedValue(mockClient as never);
			MOCK_GET_CLIENT.mockReturnValue(null as never);

			const conn = new RedisConnectionClass();
			await conn.connect();

			expect(mockClient.on).toHaveBeenCalledWith(
				"connect",
				expect.any(Function)
			);
			expect(mockClient.on).toHaveBeenCalledWith("close", expect.any(Function));
			expect(mockClient.on).toHaveBeenCalledWith("error", expect.any(Function));
		});

		it("should set state to Connected on connect event (first connect)", async () => {
			const mockClient = { on: jest.fn() };
			const handler: Record<string, () => void> = {};
			mockClient.on.mockImplementation((event: string, fn: () => void) => {
				handler[event] = fn;
			});
			MOCK_CREATE_CLIENT.mockResolvedValue(mockClient as never);
			MOCK_GET_CLIENT.mockReturnValue(null as never);

			const conn = new RedisConnectionClass();
			await conn.connect();

			expect(conn.isAvailable()).toBe(true);

			handler.connect();
			expect(conn.isAvailable()).toBe(true);
		});

		it("should set state to Disconnected on close event", async () => {
			const mockClient = { on: jest.fn() };
			const handler: Record<string, () => void> = {};
			mockClient.on.mockImplementation((event: string, fn: () => void) => {
				handler[event] = fn;
			});
			MOCK_CREATE_CLIENT.mockResolvedValue(mockClient as never);
			MOCK_GET_CLIENT.mockReturnValue(null as never);

			const conn = new RedisConnectionClass();
			await conn.connect();

			handler.close();
			expect(conn.isAvailable()).toBe(false);
		});

		it("should log error and disconnect on error event", async () => {
			const mockClient = { on: jest.fn() };
			const handler: Record<string, (...args: unknown[]) => void> = {};
			mockClient.on.mockImplementation(
				(event: string, fn: (...args: unknown[]) => void) => {
					handler[event] = fn;
				}
			);
			MOCK_CREATE_CLIENT.mockResolvedValue(mockClient as never);
			MOCK_GET_CLIENT.mockReturnValue(null as never);
			const logger = jest.requireMock("../../src/config/logger") as {
				logger: { error: jest.Mock };
			};

			const conn = new RedisConnectionClass();
			await conn.connect();

			handler.error(new Error("redis error"));

			expect(logger.logger.error).toHaveBeenCalledWith(
				"Redis queue client error",
				{ error: "redis error" }
			);
			expect(conn.isAvailable()).toBe(false);
		});

		it("should reconnect and invoke callback on reconnect", async () => {
			const registerHandler: Record<string, (...args: unknown[]) => void> = {};
			const mockClient = {
				on: jest.fn((event: string, fn: (...args: unknown[]) => void) => {
					registerHandler[event] = fn;
				}),
			};
			MOCK_CREATE_CLIENT.mockResolvedValue(mockClient as never);
			MOCK_GET_CLIENT.mockReturnValue(null as never);

			const onReconnect = jest.fn();
			const conn = new RedisConnectionClass();
			await conn.connect(onReconnect);

			registerHandler.close();
			expect(conn.isAvailable()).toBe(false);

			registerHandler.connect();
			expect(conn.isAvailable()).toBe(true);
			expect(onReconnect).toHaveBeenCalled();
		});
	});
});
