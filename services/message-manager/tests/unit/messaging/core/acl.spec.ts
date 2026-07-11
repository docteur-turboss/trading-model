import { describe, expect, it, jest } from "@jest/globals";

import { REDIS_STATUS } from "@trading-model/common/persistence/redis-constants";

jest.mock("../../../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../../src/config/redis", () => ({
	getRedisClient: jest.fn(),
}));

jest.mock("../../../../src/config/env", () => ({
	ENV: {
		REDIS_PREFIX: "mm:",
	},
}));

import { getRedisClient } from "../../../../src/config/redis";
import {
	authorizeTopic,
	extractServiceName,
} from "../../../../src/messaging/core/acl";

function createMockRedis() {
	return {
		smembers: jest
			.fn<() => Promise<string[]>>()
			.mockResolvedValue(["service-a"]),
		status: REDIS_STATUS.READY,
	};
}

describe("extractServiceName", () => {
	it("should extract service name from header", () => {
		const req = { headers: { "x-service-name": "test-service" } };
		expect(extractServiceName(req as never)).toBe("test-service");
	});

	it("should return first value if header is array", () => {
		const req = { headers: { "x-service-name": ["svc-a", "svc-b"] } };
		expect(extractServiceName(req as never)).toBe("svc-a");
	});

	it("should return null if header is missing", () => {
		const req = { headers: {} };
		expect(extractServiceName(req as never)).toBeNull();
	});
});

describe("authorizeTopic", () => {
	let mockRedis: ReturnType<typeof createMockRedis>;

	beforeEach(() => {
		mockRedis = createMockRedis();
		(getRedisClient as jest.Mock<() => Promise<unknown>>).mockResolvedValue(
			mockRedis
		);
	});

	it("should deny when x-service-name header is missing", async () => {
		const result = await authorizeTopic(
			{ headers: {} },
			"topic-missing-header"
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toBe("Missing x-service-name header");
	});

	it("should deny when Redis returns empty list", async () => {
		mockRedis.smembers.mockResolvedValue([]);

		const result = await authorizeTopic(
			{ headers: { "x-service-name": "test-service" } },
			"topic-empty"
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain("No ACL configured");
	});

	it("should allow when service is in allowed list", async () => {
		mockRedis.smembers.mockResolvedValue(["test-service"]);

		const result = await authorizeTopic(
			{ headers: { "x-service-name": "test-service" } },
			"topic-allowed"
		);
		expect(result.allowed).toBe(true);
	});

	it("should deny when service is not in allowed list", async () => {
		mockRedis.smembers.mockResolvedValue(["other-service"]);

		const result = await authorizeTopic(
			{ headers: { "x-service-name": "test-service" } },
			"topic-denied"
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toContain("not authorized");
	});

	it("should deny when Redis throws an error", async () => {
		mockRedis.smembers.mockRejectedValue(new Error("redis down"));

		const result = await authorizeTopic(
			{ headers: { "x-service-name": "test-service" } },
			"topic-error"
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toBe("ACL service unavailable — access denied");
	});

	it("should use cached value on second call", async () => {
		mockRedis.smembers.mockResolvedValue(["test-service"]);

		const result1 = await authorizeTopic(
			{ headers: { "x-service-name": "test-service" } },
			"topic-cached"
		);
		expect(result1.allowed).toBe(true);
		expect(mockRedis.smembers).toHaveBeenCalledTimes(1);

		const result2 = await authorizeTopic(
			{ headers: { "x-service-name": "test-service" } },
			"topic-cached"
		);
		expect(result2.allowed).toBe(true);
		expect(mockRedis.smembers).toHaveBeenCalledTimes(1);
	});

	it("should evict cache when max size reached", async () => {
		mockRedis.smembers.mockResolvedValue(["svc"]);

		for (let i = 0; i < 1001; i++) {
			await authorizeTopic(
				{ headers: { "x-service-name": "svc" } },
				`topic-evict-${i}`
			);
		}
	});

	it("should handle concurrent requests to same topic with correct results", async () => {
		mockRedis.smembers.mockResolvedValue(["svc-a"]);

		const results = await Promise.all([
			authorizeTopic(
				{ headers: { "x-service-name": "svc-a" } },
				"topic-concurrent"
			),
			authorizeTopic(
				{ headers: { "x-service-name": "svc-a" } },
				"topic-concurrent"
			),
		]);

		expect(results[0].allowed).toBe(true);
		expect(results[1].allowed).toBe(true);
	});
});
