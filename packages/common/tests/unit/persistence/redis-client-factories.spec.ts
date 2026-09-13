import { describe, expect, it } from "@jest/globals";
import Redis, { Cluster } from "ioredis";
import {
	BASE_REDIS_OPTIONS,
	BASE_RETRY_STRATEGY,
	buildFromConfig,
	createClusterClient,
	createFromUrl,
	createSentinel,
} from "../../../src/persistence/redis-client-factories";

jest.mock("ioredis", () => {
	class MockRedis {
		on(): this {
			return this;
		}
	}

	class MockCluster {
		on(): this {
			return this;
		}
	}

	return {
		__esModule: true,
		default: MockRedis,
		Redis: MockRedis,
		Cluster: MockCluster,
	};
});

describe("BASE_RETRY_STRATEGY", () => {
	it("should return backoff within bounds", () => {
		expect(BASE_RETRY_STRATEGY(1)).toBe(200);
		expect(BASE_RETRY_STRATEGY(10)).toBe(2000);
		expect(BASE_RETRY_STRATEGY(20)).toBe(4000);
	});

	it("should return null after 20 attempts", () => {
		expect(BASE_RETRY_STRATEGY(21)).toBeNull();
		expect(BASE_RETRY_STRATEGY(25)).toBeNull();
	});
});

describe("BASE_REDIS_OPTIONS", () => {
	it("should default to lazyConnect with retry strategy", () => {
		expect(BASE_REDIS_OPTIONS.lazyConnect).toBe(true);
		expect(BASE_REDIS_OPTIONS.retryStrategy).toBe(BASE_RETRY_STRATEGY);
	});
});

describe("createFromUrl", () => {
	it("should create a Redis client from a URL", () => {
		const client = createFromUrl("redis://localhost:6379" as never);
		expect(client).toBeInstanceOf(Redis);
	});

	it("should merge extra options", () => {
		const client = createFromUrl("redis://localhost:6379" as never, {
			maxRetriesPerRequest: 3,
		});
		expect(client).toBeInstanceOf(Redis);
	});
});

describe("createSentinel", () => {
	it("should create a Redis client from sentinel config", () => {
		const client = createSentinel({
			sentinels: [{ host: "127.0.0.1" as never, port: 26379 as never }],
			name: "mymaster",
			password: "secret",
		});
		expect(client).toBeInstanceOf(Redis);
	});
});

describe("createClusterClient", () => {
	it("should create a Cluster client", () => {
		const client = createClusterClient([
			{ host: "127.0.0.1" as never, port: 7000 as never },
		]);
		expect(client).toBeInstanceOf(Cluster);
	});
});

describe("buildFromConfig", () => {
	it("should build a single-mode client", () => {
		const client = buildFromConfig({
			mode: "single",
			url: "redis://localhost:6379" as never,
		});
		expect(client).toBeInstanceOf(Redis);
	});

	it("should build a sentinel-mode client", () => {
		const client = buildFromConfig({
			mode: "sentinel",
			config: {
				sentinels: [{ host: "127.0.0.1" as never, port: 26379 as never }],
				name: "mymaster",
			},
		});
		expect(client).toBeInstanceOf(Redis);
	});

	it("should build a cluster-mode client", () => {
		const client = buildFromConfig({
			mode: "cluster",
			config: {
				nodes: [{ host: "127.0.0.1" as never, port: 7000 as never }],
			},
		});
		expect(client).toBeInstanceOf(Cluster);
	});

	it("should throw for unknown modes", () => {
		expect(() =>
			buildFromConfig({ mode: "bogus", url: "redis://localhost:6379" } as never)
		).toThrow("Unknown Redis mode");
	});
});
