import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import Redis from "ioredis";
import {
	BASE_REDIS_OPTIONS,
	BASE_RETRY_STRATEGY,
	buildFromConfig,
	createFromUrl,
	createSentinel,
	SENTINEL_RETRY_STRATEGY,
} from "../../src/redis-client-factories";

jest.mock("ioredis", () => {
	class MockRedis {
		static lastOptions: Record<string, unknown> | undefined;

		readonly listeners: Record<string, () => void> = {};

		constructor(
			options?: Record<string, unknown> | string,
			urlOptions?: Record<string, unknown>
		) {
			MockRedis.lastOptions =
				urlOptions ?? (options as Record<string, unknown>);
		}

		on(event: string, listener: () => void): this {
			this.listeners[event] = listener;
			return this;
		}
	}

	return {
		__esModule: true,
		default: MockRedis,
		Redis: MockRedis,
	};
});

describe("BASE_RETRY_STRATEGY", () => {
	it("should return backoff within bounds", () => {
		expect(BASE_RETRY_STRATEGY(1)).toBe(200);
		expect(BASE_RETRY_STRATEGY(10)).toBe(2000);
		expect(BASE_RETRY_STRATEGY(20)).toBe(4000);
	});

	it("should never give up and cap the delay at 5 s", () => {
		expect(BASE_RETRY_STRATEGY(21)).toBe(4200);
		expect(BASE_RETRY_STRATEGY(1000)).toBe(5000);
	});
});

describe("SENTINEL_RETRY_STRATEGY", () => {
	it("caps at 1 s and never gives up", () => {
		expect(SENTINEL_RETRY_STRATEGY(1)).toBe(200);
		expect(SENTINEL_RETRY_STRATEGY(100)).toBe(1000);
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
		createFromUrl("redis://localhost:6379" as never, {
			maxRetriesPerRequest: 3,
		});
		const options = (Redis as unknown as { lastOptions: Record<string, any> })
			.lastOptions;
		expect(options.maxRetriesPerRequest).toBe(3);
	});
});

describe("command deadline", () => {
	it.each([
		["url", () => createFromUrl("redis://localhost:6379" as never)],
		[
			"sentinel",
			() =>
				createSentinel({
					sentinels: [{ host: "127.0.0.1" as never, port: 26379 as never }],
					name: "mymaster",
				}),
		],
	])("should bound commands and retries in %s mode", (_mode, build) => {
		build();
		const options = (Redis as unknown as { lastOptions: Record<string, any> })
			.lastOptions;
		expect(options.connectTimeout).toBe(2000);
		expect(options.commandTimeout).toBe(2000);
		expect(options.maxRetriesPerRequest).toBe(5);
	});
});

describe("createSentinel", () => {
	it("should retire the failover detector when the connection closes", () => {
		const client = createSentinel({
			sentinels: [{ host: "127.0.0.1" as never, port: 26379 as never }],
			name: "mymaster",
		}) as unknown as {
			connector?: {
				failoverDetector: {
					cleanup: jest.Mock<(...args: any[]) => any>;
				} | null;
			};
			listeners: Record<string, () => void>;
		};
		const cleanup = jest.fn();

		// Before the first connection there is no detector to retire.
		client.listeners.close();
		client.connector = { failoverDetector: { cleanup } };
		client.listeners.close();

		expect(cleanup).toHaveBeenCalledTimes(1);
	});
});

describe("createSentinel with TLS", () => {
	it("should pass the CA and server name to the nodes and the sentinels", () => {
		const dir = mkdtempSync(join(tmpdir(), "redis-tls-"));
		const caPath = join(dir, "ca.crt");
		writeFileSync(caPath, "PEM");
		createSentinel({
			sentinels: [{ host: "127.0.0.1" as never, port: 26380 as never }],
			name: "mymaster",
			tls: { caPath, servername: "redis" },
		});
		const options = (Redis as unknown as { lastOptions: Record<string, any> })
			.lastOptions;
		expect(options.enableTLSForSentinelMode).toBe(true);
		for (const tls of [options.tls, options.sentinelTLS]) {
			expect(tls.servername).toBe("redis");
			expect(tls.ca.toString()).toBe("PEM");
		}
		expect(options.natMap("10.0.0.5:6379")).toEqual({
			host: "10.0.0.5",
			port: 6380,
		});
		expect(options.natMap("10.0.0.5:6380")).toBeUndefined();
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
});
