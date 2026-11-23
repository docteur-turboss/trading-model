import { describe, expect, it } from "@jest/globals";
import Redis from "ioredis";
import { createRedisClient } from "../../src/redis-connection-manager";

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

	return {
		__esModule: true,
		default: MockRedis,
		Redis: MockRedis,
	};
});

describe("createRedisClient", () => {
	it("should create a client from a single-node config", () => {
		const client = createRedisClient({
			mode: "single",
			url: "redis://localhost:6379" as never,
		});
		expect(client).toBeInstanceOf(Redis);
	});
});
