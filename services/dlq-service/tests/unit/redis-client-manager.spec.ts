import { describe, expect, it, jest } from "@jest/globals";

const MOCK_CONNECT = jest.fn();
const MOCK_QUIT = jest.fn();
const MOCK_DISCONNECT = jest.fn();
const MOCK_REMOVE_ALL_LISTENERS = jest.fn();

jest.mock("ioredis", () => {
	return jest.fn(() => ({
		connect: MOCK_CONNECT,
		quit: MOCK_QUIT,
		disconnect: MOCK_DISCONNECT,
		removeAllListeners: MOCK_REMOVE_ALL_LISTENERS,
		status: "ready",
	}));
});

describe("RedisClientManager", () => {
	let RedisClientManagerClass: new () => {
		createClient: (url: string) => Promise<unknown>;
		getClient: () => unknown;
		closeClient: () => Promise<void>;
		removeAllListeners: () => void;
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/config/redis-client-manager") as {
			RedisClientManager: typeof RedisClientManagerClass;
		};
		RedisClientManagerClass = mod.RedisClientManager;
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should create a client and connect", async () => {
		const manager = new RedisClientManagerClass();
		MOCK_CONNECT.mockResolvedValue(undefined as never);

		const client = await manager.createClient("redis://localhost:6379");

		expect(client).toBeDefined();
		expect(MOCK_CONNECT).toHaveBeenCalled();
	});

	it("should return the client via getClient", async () => {
		const manager = new RedisClientManagerClass();
		MOCK_CONNECT.mockResolvedValue(undefined as never);

		await manager.createClient("redis://localhost:6379");
		const client = manager.getClient();

		expect(client).toBeDefined();
	});

	it("should return null from getClient when no client exists", () => {
		const manager = new RedisClientManagerClass();
		expect(manager.getClient()).toBeNull();
	});

	it("should close client with quit when status is ready", async () => {
		const manager = new RedisClientManagerClass();
		MOCK_CONNECT.mockResolvedValue(undefined as never);
		MOCK_QUIT.mockResolvedValue(undefined as never);

		await manager.createClient("redis://localhost:6379");
		await manager.closeClient();

		expect(MOCK_QUIT).toHaveBeenCalled();
	});

	it("should close client with disconnect when status is not ready", async () => {
		const Redis = require("ioredis");
		const mockClient = {
			connect: MOCK_CONNECT,
			quit: MOCK_QUIT,
			disconnect: MOCK_DISCONNECT,
			removeAllListeners: MOCK_REMOVE_ALL_LISTENERS,
			status: "connecting",
		};
		Redis.mockReturnValue(mockClient);

		const manager = new RedisClientManagerClass();
		MOCK_CONNECT.mockResolvedValue(undefined as never);

		await manager.createClient("redis://localhost:6379");
		await manager.closeClient();

		expect(MOCK_DISCONNECT).toHaveBeenCalled();
	});

	it("should handle closeClient when no client exists", async () => {
		const manager = new RedisClientManagerClass();
		await expect(manager.closeClient()).resolves.toBeUndefined();
	});

	it("should disconnect on closeClient error", async () => {
		const Redis = require("ioredis");
		const mockClient = {
			connect: MOCK_CONNECT,
			quit: jest.fn(() => Promise.reject(new Error("quit error"))),
			disconnect: MOCK_DISCONNECT,
			removeAllListeners: MOCK_REMOVE_ALL_LISTENERS,
			status: "ready",
		};
		Redis.mockReturnValue(mockClient);

		const manager = new RedisClientManagerClass();
		MOCK_CONNECT.mockResolvedValue(undefined as never);

		await manager.createClient("redis://localhost:6379");
		await manager.closeClient();

		expect(MOCK_DISCONNECT).toHaveBeenCalled();
	});

	it("should remove all listeners", async () => {
		const manager = new RedisClientManagerClass();
		manager.removeAllListeners();

		expect(MOCK_REMOVE_ALL_LISTENERS).not.toHaveBeenCalled();

		MOCK_CONNECT.mockResolvedValue(undefined as never);
		await manager.createClient("redis://localhost:6379");
		manager.removeAllListeners();

		expect(MOCK_REMOVE_ALL_LISTENERS).toHaveBeenCalled();
	});
});
