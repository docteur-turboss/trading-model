import { describe, expect, it } from "@jest/globals";
import Redis from "ioredis";
import {
	createRedisClient,
	createRedisConnectionManager,
} from "../../../src/persistence/redis-connection-manager";

jest.mock("ioredis", () => {
	class MockRedis {
		status = "connecting";

		on(): this {
			return this;
		}

		connect(): Promise<void> {
			return Promise.resolve();
		}

		disconnect(): void {}
	}

	class MockCluster {
		status = "connecting";

		on(): this {
			return this;
		}

		connect(): Promise<void> {
			return Promise.resolve();
		}

		disconnect(): void {}
	}

	return {
		__esModule: true,
		default: MockRedis,
		Redis: MockRedis,
		Cluster: MockCluster,
	};
});

describe("createRedisClient", () => {
	it("should create a client from a URL string", () => {
		const client = createRedisClient("redis://localhost:6379");
		expect(client).toBeInstanceOf(Redis);
	});

	it("should create a client from a config object", () => {
		const client = createRedisClient({
			mode: "single",
			url: "redis://localhost:6379" as never,
		});
		expect(client).toBeInstanceOf(Redis);
	});
});

describe("createRedisConnectionManager", () => {
	it("should create a connection manager that connects", async () => {
		const manager = createRedisConnectionManager("redis://localhost:6379");
		const client = await manager.getConnection();
		expect(client).toBeInstanceOf(Redis);
		expect(manager.isConnected()).toBe(true);
	});

	it("should create a manager from a config object", async () => {
		const manager = createRedisConnectionManager({
			mode: "single",
			url: "redis://localhost:6379" as never,
		});
		const client = await manager.getConnection();
		expect(client).toBeInstanceOf(Redis);
	});

	it("should disconnect on close", async () => {
		const manager = createRedisConnectionManager("redis://localhost:6379");
		await manager.getConnection();
		await manager.close();
		expect(manager.isConnected()).toBe(false);
	});
});
