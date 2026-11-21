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
	it("should create a client from a URL string", () => {
		const client = createRedisClient("redis://localhost:6379");
		expect(client).toBeInstanceOf(Redis);
	});
});
