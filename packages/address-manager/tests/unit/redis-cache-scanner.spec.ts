import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import {
	IPAddress,
	Port,
	toDurationMs,
	toInstanceId,
	toServiceId,
	toVersion,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { Protocol } from "@trading-model/validation/contracts/service-registry.types";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		warn: jest.fn(),
		debug: jest.fn(),
	},
}));

import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstance } from "../../src/client/type";
import { RedisCacheScanner } from "../../src/discovery/redis-cache-scanner";

const MockedLogger = jest.mocked(logger);

function serviceInstance(
	overrides?: Partial<ServiceInstance>
): ServiceInstance {
	return {
		host: IPAddress.of("127.0.0.1"),
		port: Port.of(8080),
		instanceId: toInstanceId("inst-1"),
		lastHeartbeat: UnixTimestamp.of(1_700_000_000_000),
		protocol: Protocol.Http,
		registeredAt: UnixTimestamp.of(1_700_000_000_000),
		serviceName: toServiceId("user-service"),
		version: toVersion("1.0.0"),
		ttl: toDurationMs(30000),
		...overrides,
	};
}

describe("RedisCacheScanner", () => {
	let redis: {
		scan: jest.Mock<(...args: any[]) => Promise<[string, string[]]>>;
		get: jest.Mock<(...args: any[]) => Promise<string | null>>;
		pipeline: jest.Mock<
			(...args: any[]) => { del: jest.Mock<any>; exec: jest.Mock<any> }
		>;
		del: jest.Mock<any>;
	};
	let scanner: RedisCacheScanner;
	const prefix = "test:prefix:";

	beforeEach(() => {
		redis = {
			scan: jest
				.fn<(...args: any[]) => Promise<[string, string[]]>>()
				.mockResolvedValue(["0", []]),
			get: jest.fn<(...args: any[]) => Promise<string | null>>(),
			pipeline:
				jest.fn<
					(...args: any[]) => { del: jest.Mock<any>; exec: jest.Mock<any> }
				>(),
			del: jest.fn<any>(),
		};
		scanner = new RedisCacheScanner(redis as any, prefix);
	});

	describe("constructor", () => {
		test("stores redis and prefix", async () => {
			redis.scan.mockResolvedValueOnce(["0", []]);
			await scanner.entries();
			expect(redis.scan).toHaveBeenCalledWith(
				"0",
				"MATCH",
				`${prefix}*`,
				"COUNT",
				200
			);
		});
	});

	describe("clear()", () => {
		test("scans all keys and deletes them", async () => {
			redis.scan.mockResolvedValueOnce(["0", ["key1", "key2"]]);
			const pipeline = { del: jest.fn<any>(), exec: jest.fn<any>() };
			redis.pipeline.mockReturnValue(pipeline);
			pipeline.exec.mockResolvedValue([]);

			await scanner.clear();

			expect(redis.scan).toHaveBeenCalledTimes(1);
			expect(pipeline.del).toHaveBeenCalledTimes(2);
			expect(pipeline.del).toHaveBeenCalledWith("key1");
			expect(pipeline.del).toHaveBeenCalledWith("key2");
			expect(pipeline.exec).toHaveBeenCalledTimes(1);
		});

		test("handles multi-page scan", async () => {
			redis.scan
				.mockResolvedValueOnce(["1", ["key1"]])
				.mockResolvedValueOnce(["0", ["key2"]]);
			const pipeline = { del: jest.fn<any>(), exec: jest.fn<any>() };
			redis.pipeline.mockReturnValue(pipeline);
			pipeline.exec.mockResolvedValue([]);

			await scanner.clear();

			expect(redis.scan).toHaveBeenCalledTimes(2);
			expect(pipeline.del).toHaveBeenCalledTimes(2);
			expect(pipeline.del).toHaveBeenCalledWith("key1");
			expect(pipeline.del).toHaveBeenCalledWith("key2");
		});

		test("does not call pipeline when no keys returned", async () => {
			redis.scan.mockResolvedValueOnce(["0", []]);

			await scanner.clear();

			expect(redis.pipeline).not.toHaveBeenCalled();
		});

		test("catches scan failure and logs warning", async () => {
			const err = new Error("SCAN failed");
			redis.scan.mockRejectedValueOnce(err);

			await scanner.clear();

			expect(MockedLogger.warn).toHaveBeenCalledWith(
				"Redis cache clear failed",
				expect.objectContaining({ error: expect.any(Error) })
			);
		});
	});

	describe("entries()", () => {
		test("scans and parses entries, returns results", async () => {
			redis.scan.mockResolvedValueOnce(["0", [`${prefix}user-service`]]);
			redis.get.mockResolvedValueOnce(JSON.stringify(serviceInstance()));

			const results = await scanner.entries();

			expect(results).toHaveLength(1);
			expect(results[0].serviceName).toBe(toServiceId("user-service"));
			expect(results[0].region).toBeUndefined();
		});

		test("skips entry when raw value is null", async () => {
			redis.scan.mockResolvedValueOnce(["0", [`${prefix}user-service`]]);
			redis.get.mockResolvedValueOnce(null);

			const results = await scanner.entries();

			expect(results).toHaveLength(0);
		});

		test("skips entry when raw value is empty string", async () => {
			redis.scan.mockResolvedValueOnce(["0", [`${prefix}user-service`]]);
			redis.get.mockResolvedValueOnce("");

			const results = await scanner.entries();

			expect(results).toHaveLength(0);
		});

		test("handles invalid JSON gracefully", async () => {
			redis.scan.mockResolvedValueOnce(["0", [`${prefix}user-service`]]);
			redis.get.mockResolvedValueOnce("{broken");

			const results = await scanner.entries();

			expect(results).toHaveLength(0);
			expect(MockedLogger.debug).toHaveBeenCalledWith(
				"Skipped corrupt cache entry"
			);
		});

		test("skips entry when instance has no serviceName", async () => {
			redis.scan.mockResolvedValueOnce(["0", [`${prefix}user-service`]]);
			redis.get.mockResolvedValueOnce(
				JSON.stringify({ host: "127.0.0.1", port: 8080 })
			);

			const results = await scanner.entries();

			expect(results).toHaveLength(0);
		});

		test("skips entry when instance property wrapper has no serviceName", async () => {
			redis.scan.mockResolvedValueOnce(["0", [`${prefix}user-service`]]);
			redis.get.mockResolvedValueOnce(
				JSON.stringify({
					instance: { host: "127.0.0.1", port: 8080 },
				})
			);

			const results = await scanner.entries();

			expect(results).toHaveLength(0);
		});

		test("extracts region from key with :: separator", async () => {
			redis.scan.mockResolvedValueOnce([
				"0",
				[`${prefix}user-service::us-east-1`],
			]);
			redis.get.mockResolvedValueOnce(JSON.stringify(serviceInstance()));

			const results = await scanner.entries();

			expect(results).toHaveLength(1);
			expect(results[0].serviceName).toBe(toServiceId("user-service"));
			expect(results[0].region).toBe("us-east-1");
		});

		test("handles key without region suffix", async () => {
			redis.scan.mockResolvedValueOnce(["0", [`${prefix}user-service`]]);
			redis.get.mockResolvedValueOnce(JSON.stringify(serviceInstance()));

			const results = await scanner.entries();

			expect(results).toHaveLength(1);
			expect(results[0].serviceName).toBe(toServiceId("user-service"));
			expect(results[0].region).toBeUndefined();
		});

		test("supports nested instance wrapper in parsed value", async () => {
			redis.scan.mockResolvedValueOnce(["0", [`${prefix}user-service`]]);
			redis.get.mockResolvedValueOnce(
				JSON.stringify({
					instance: serviceInstance(),
					extra: "meta",
				})
			);

			const results = await scanner.entries();

			expect(results).toHaveLength(1);
			expect(results[0].serviceName).toBe(toServiceId("user-service"));
		});

		test("returns empty array when scan fails", async () => {
			redis.scan.mockRejectedValueOnce(new Error("connection lost"));

			const results = await scanner.entries();

			expect(results).toEqual([]);
			expect(MockedLogger.warn).toHaveBeenCalledWith(
				"Redis cache entries() failed",
				expect.objectContaining({ error: expect.any(Error) })
			);
		});

		test("returns empty array when redis get fails", async () => {
			redis.scan.mockResolvedValueOnce(["0", [`${prefix}user-service`]]);
			redis.get.mockRejectedValueOnce(new Error("GET failed"));

			const results = await scanner.entries();

			expect(results).toEqual([]);
			expect(MockedLogger.warn).toHaveBeenCalledWith(
				"Redis cache entries() failed",
				expect.objectContaining({ error: expect.any(Error) })
			);
		});
	});
});
