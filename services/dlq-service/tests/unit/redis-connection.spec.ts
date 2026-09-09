import { describe, expect, it, jest } from "@jest/globals";

const MOCK_CREATE_REDIS_CLIENT = jest.fn();
const MOCK_CLIENT_CONNECT = jest.fn();
const MOCK_CLIENT_QUIT = jest.fn();
const MOCK_CLIENT_DISCONNECT = jest.fn();
const MOCK_CLIENT_ON = jest.fn();
const MOCK_CLIENT_REMOVE_ALL_LISTENERS = jest.fn();

jest.mock("@trading-model/common/persistence/redis-connection-manager", () => ({
	createRedisClient: MOCK_CREATE_REDIS_CLIENT,
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		REDIS_URL: "redis://localhost:6379",
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function makeMockClient(overrides?: Record<string, unknown>) {
	return {
		on: MOCK_CLIENT_ON,
		connect: MOCK_CLIENT_CONNECT,
		quit: MOCK_CLIENT_QUIT,
		disconnect: MOCK_CLIENT_DISCONNECT,
		removeAllListeners: MOCK_CLIENT_REMOVE_ALL_LISTENERS,
		status: "ready",
		...overrides,
	};
}

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
		const mockClient = makeMockClient();
		MOCK_CREATE_REDIS_CLIENT.mockReturnValue(mockClient);
		MOCK_CLIENT_CONNECT.mockResolvedValue(undefined);

		const conn = new RedisConnectionClass();
		const result = await conn.connect();

		expect(result).toBe(true);
		expect(conn.isAvailable()).toBe(true);
	});

	it("should return true when already connected", async () => {
		const mockClient = makeMockClient();
		MOCK_CREATE_REDIS_CLIENT.mockReturnValue(mockClient);
		MOCK_CLIENT_CONNECT.mockResolvedValue(undefined);

		const conn = new RedisConnectionClass();
		await conn.connect();
		const result = await conn.connect();

		expect(result).toBe(true);
		expect(MOCK_CREATE_REDIS_CLIENT).toHaveBeenCalledTimes(1);
	});

	it("should handle reconnection after close", async () => {
		const mockClient = makeMockClient();
		MOCK_CREATE_REDIS_CLIENT.mockReturnValue(mockClient);
		MOCK_CLIENT_CONNECT.mockResolvedValue(undefined);

		const conn = new RedisConnectionClass();
		await conn.connect();
		expect(conn.isAvailable()).toBe(true);

		await conn.close();
		expect(conn.isAvailable()).toBe(false);

		const mockClient2 = makeMockClient();
		MOCK_CREATE_REDIS_CLIENT.mockReturnValue(mockClient2);

		const result = await conn.connect();
		expect(result).toBe(true);
		expect(MOCK_CREATE_REDIS_CLIENT).toHaveBeenCalledTimes(2);
	});

	it("should return false when REDIS_URL is not set", async () => {
		const envMock = jest.requireMock("../../src/infrastructure/config/env") as {
			ENV: { REDIS_URL: string };
		};
		envMock.ENV.REDIS_URL = "";

		const conn = new RedisConnectionClass();
		const result = await conn.connect();

		expect(result).toBe(false);

		envMock.ENV.REDIS_URL = "redis://localhost:6379";
	});

	it("should handle connect error for first connection", async () => {
		MOCK_CREATE_REDIS_CLIENT.mockImplementation(() => {
			throw new Error("connection refused");
		});

		const conn = new RedisConnectionClass();
		const result = await conn.connect();

		expect(result).toBe(false);
		expect(conn.isAvailable()).toBe(false);
	});

	it("should handle connect error for reconnection", async () => {
		const mockClient = makeMockClient();
		MOCK_CREATE_REDIS_CLIENT.mockReturnValueOnce(mockClient);
		MOCK_CLIENT_CONNECT.mockResolvedValue(undefined);

		const conn = new RedisConnectionClass();
		await conn.connect();
		await conn.close();

		MOCK_CREATE_REDIS_CLIENT.mockImplementation(() => {
			throw new Error("connection refused");
		});
		const result = await conn.connect();

		expect(result).toBe(false);
	});

	it("should close connection", async () => {
		const mockClient = makeMockClient();
		MOCK_CREATE_REDIS_CLIENT.mockReturnValue(mockClient);
		MOCK_CLIENT_CONNECT.mockResolvedValue(undefined);

		const conn = new RedisConnectionClass();
		await conn.connect();
		await conn.close();

		expect(MOCK_CLIENT_QUIT).toHaveBeenCalled();
		expect(MOCK_CLIENT_REMOVE_ALL_LISTENERS).toHaveBeenCalled();
		expect(conn.isAvailable()).toBe(false);
	});

	it("should handle close when no client exists", async () => {
		const conn = new RedisConnectionClass();
		await conn.close();

		expect(MOCK_CLIENT_QUIT).not.toHaveBeenCalled();
		expect(conn.isAvailable()).toBe(false);
	});

	it("should return client via getClient", async () => {
		const mockClient = makeMockClient();
		MOCK_CREATE_REDIS_CLIENT.mockReturnValue(mockClient);
		MOCK_CLIENT_CONNECT.mockResolvedValue(undefined);

		const conn = new RedisConnectionClass();
		await conn.connect();
		expect(conn.getClient()).toBe(mockClient);
	});

	it("should handle close of existing non-connected client before connect", async () => {
		const mockOldClient = makeMockClient({ status: "connecting" });
		const mockNewClient = makeMockClient();

		MOCK_CREATE_REDIS_CLIENT.mockReturnValueOnce(mockOldClient);
		MOCK_CLIENT_CONNECT.mockRejectedValue(new Error("timeout"));

		const conn = new RedisConnectionClass();
		await conn.connect();
		expect(conn.isAvailable()).toBe(false);

		MOCK_CREATE_REDIS_CLIENT.mockReturnValue(mockNewClient);
		MOCK_CLIENT_CONNECT.mockResolvedValue(undefined);

		const result = await conn.connect();
		expect(result).toBe(true);
	});

	it("should return false when already connecting", async () => {
		const conn = new RedisConnectionClass() as {
			connect: (onReconnect?: () => void) => Promise<boolean>;
			_state: string;
		};
		(conn as Record<string, unknown>)._state = "Connecting";

		const result = await conn.connect();

		expect(result).toBe(false);
	});

	describe("event handlers", () => {
		function createHandlerClient() {
			const handlers: Record<string, (...args: unknown[]) => void> = {};
			return {
				on: jest.fn((event: string, fn: (...args: unknown[]) => void) => {
					handlers[event] = fn;
				}),
				connect: MOCK_CLIENT_CONNECT,
				quit: MOCK_CLIENT_QUIT,
				disconnect: MOCK_CLIENT_DISCONNECT,
				removeAllListeners: MOCK_CLIENT_REMOVE_ALL_LISTENERS,
				status: "ready",
				_handlers: handlers,
			};
		}

		it("should attach event handlers during connect", async () => {
			const mockClient = createHandlerClient();
			MOCK_CREATE_REDIS_CLIENT.mockReturnValue(mockClient);
			MOCK_CLIENT_CONNECT.mockResolvedValue(undefined);

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
			const mockClient = createHandlerClient();
			MOCK_CREATE_REDIS_CLIENT.mockReturnValue(mockClient);
			MOCK_CLIENT_CONNECT.mockResolvedValue(undefined);

			const conn = new RedisConnectionClass();
			await conn.connect();

			expect(conn.isAvailable()).toBe(true);

			mockClient._handlers.connect();
			expect(conn.isAvailable()).toBe(true);
		});

		it("should set state to Disconnected on close event", async () => {
			const mockClient = createHandlerClient();
			MOCK_CREATE_REDIS_CLIENT.mockReturnValue(mockClient);
			MOCK_CLIENT_CONNECT.mockResolvedValue(undefined);

			const conn = new RedisConnectionClass();
			await conn.connect();

			mockClient._handlers.close();
			expect(conn.isAvailable()).toBe(false);
		});

		it("should log error and disconnect on error event", async () => {
			const mockClient = createHandlerClient();
			MOCK_CREATE_REDIS_CLIENT.mockReturnValue(mockClient);
			MOCK_CLIENT_CONNECT.mockResolvedValue(undefined);
			const logger = jest.requireMock("../../src/config/logger") as {
				logger: { error: jest.Mock };
			};

			const conn = new RedisConnectionClass();
			await conn.connect();

			mockClient._handlers.error(new Error("redis error"));

			expect(logger.logger.error).toHaveBeenCalledWith(
				"Redis queue client error",
				{ error: "redis error" }
			);
			expect(conn.isAvailable()).toBe(false);
		});

		it("should reconnect and invoke callback on reconnect", async () => {
			const handlers: Record<string, (...args: unknown[]) => void> = {};
			const mockClient = {
				on: jest.fn((event: string, fn: (...args: unknown[]) => void) => {
					handlers[event] = fn;
				}),
				connect: MOCK_CLIENT_CONNECT,
				quit: MOCK_CLIENT_QUIT,
				disconnect: MOCK_CLIENT_DISCONNECT,
				removeAllListeners: MOCK_CLIENT_REMOVE_ALL_LISTENERS,
				status: "ready",
			};
			MOCK_CREATE_REDIS_CLIENT.mockReturnValue(mockClient);
			MOCK_CLIENT_CONNECT.mockResolvedValue(undefined);

			const onReconnect = jest.fn();
			const conn = new RedisConnectionClass();
			await conn.connect(onReconnect);

			handlers.close();
			expect(conn.isAvailable()).toBe(false);

			handlers.connect();
			expect(conn.isAvailable()).toBe(true);
			expect(onReconnect).toHaveBeenCalled();
		});
	});
});
