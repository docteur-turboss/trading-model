import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

interface MockMulti {
	sadd: jest.Mock;
	set: jest.Mock;
	srem: jest.Mock;
	del: jest.Mock;
	exec: jest.Mock;
}

interface MockRedisInstance {
	on: jest.Mock;
	set: jest.Mock;
	get: jest.Mock;
	sismember: jest.Mock;
	multi: jest.Mock;
	eval: jest.Mock;
}

const MOCK_MULTI: MockMulti = {
	sadd: jest.fn().mockReturnThis(),
	set: jest.fn().mockReturnThis(),
	srem: jest.fn().mockReturnThis(),
	del: jest.fn().mockReturnThis(),
	exec: jest.fn().mockResolvedValue([[null, "OK"]]),
};

const MOCK_REDIS = Object.assign(jest.fn().mockReturnThis(), {
	on: jest.fn().mockReturnThis(),
	set: jest.fn().mockResolvedValue("OK"),
	get: jest.fn().mockResolvedValue(null),
	sismember: jest.fn().mockResolvedValue(1),
	multi: jest.fn().mockReturnValue(MOCK_MULTI),
	eval: jest.fn().mockResolvedValue(1),
}) as unknown as jest.Mock & MockRedisInstance;

jest.mock("ioredis", () => ({
	__esModule: true,
	default: jest.fn(() => MOCK_REDIS),
	Redis: jest.fn(() => MOCK_REDIS),
}));

import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import { InstanceHeartbeatHandler } from "../../src/adapters/outbound/instance-heartbeat-handler";
import type { InstanceMetadataReader } from "../../src/adapters/outbound/instance-metadata-reader";

describe("InstanceHeartbeatHandler", () => {
	let handler: InstanceHeartbeatHandler;
	let mockReader: jest.Mocked<InstanceMetadataReader>;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();

		mockReader = {
			getMetadata: jest.fn<() => Promise<ServiceInstance | undefined>>(),
		} as unknown as jest.Mocked<InstanceMetadataReader>;

		handler = new InstanceHeartbeatHandler(
			{ redis: MOCK_REDIS as never, keyPrefix: "" },
			mockReader
		);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("constructor", () => {
		it("should create an instance with provided deps and reader", () => {
			expect(handler).toBeInstanceOf(InstanceHeartbeatHandler);
		});

		it("should create a default InstanceMetadataReader when not provided", () => {
			const h = new InstanceHeartbeatHandler({
				redis: MOCK_REDIS as never,
				keyPrefix: "",
			});
			expect(h).toBeInstanceOf(InstanceHeartbeatHandler);
		});
	});

	describe("updateHeartbeat", () => {
		const identity: ServiceIdentity = {
			serviceName: "financial-scraper-service" as never,
			instanceId: "i1" as never,
		};
		const mockInstance: ServiceInstance = {
			serviceName: "financial-scraper-service",
			instanceId: "i1",
			host: "192.168.1.10",
			port: 8444,
			version: "1.0.0",
			ttl: 30000,
			protocol: "mtls",
			registeredAt: Date.now() - 1000,
			lastHeartbeat: Date.now() - 500,
		};

		it("should return false when instance is not a member of the service set", async () => {
			MOCK_REDIS.sismember.mockResolvedValue(0);

			const result = await handler.updateHeartbeat(identity);

			expect(result).toBe(false);
		});

		it("should return false when metadata does not exist", async () => {
			MOCK_REDIS.sismember.mockResolvedValue(1);
			mockReader.getMetadata.mockResolvedValue(undefined);

			const result = await handler.updateHeartbeat(identity);

			expect(result).toBe(false);
		});

		it("should persist heartbeat and return TTL on success", async () => {
			MOCK_REDIS.sismember.mockResolvedValue(1);
			mockReader.getMetadata.mockResolvedValue(mockInstance);

			const result = await handler.updateHeartbeat(identity);

			expect(result).toBe(30000);
			expect(MOCK_REDIS.eval).toHaveBeenCalledWith(
				expect.stringContaining("SISMEMBER"),
				3,
				"service:financial-scraper-service:instances",
				"instance:i1:metadata",
				"instance:i1:updatedBy",
				"i1",
				expect.any(String),
				expect.any(String)
			);
		});

		it("should return false when the instance was removed before the write", async () => {
			MOCK_REDIS.sismember.mockResolvedValue(1);
			mockReader.getMetadata.mockResolvedValue(mockInstance);
			MOCK_REDIS.eval.mockResolvedValueOnce(0);

			const result = await handler.updateHeartbeat(identity);

			expect(result).toBe(false);
		});

		it("should use Math.max to preserve the later heartbeat time", async () => {
			MOCK_REDIS.sismember.mockResolvedValue(1);
			const futureTime = Date.now() + 5000;
			const pastInstance = {
				...mockInstance,
				lastHeartbeat: futureTime,
			};
			mockReader.getMetadata.mockResolvedValue(pastInstance);

			await handler.updateHeartbeat(identity);

			const stored = JSON.parse(MOCK_REDIS.eval.mock.calls[0][6] as string);
			expect(stored.lastHeartbeat).toBe(futureTime);
		});

		it("should log a warning and return false when Redis write fails", async () => {
			const { logger } = jest.requireMock(
				"@trading-model/http/infrastructure/logger"
			) as { logger: { warn: jest.Mock } };

			MOCK_REDIS.sismember.mockResolvedValue(1);
			mockReader.getMetadata.mockResolvedValue(mockInstance);
			MOCK_REDIS.eval.mockRejectedValueOnce(new Error("Redis write error"));

			const result = await handler.updateHeartbeat(identity);

			expect(result).toBe(false);
			expect(logger.warn).toHaveBeenCalledWith(
				"Failed to update heartbeat in Redis",
				expect.objectContaining({
					serviceName: identity.serviceName,
					instanceId: identity.instanceId,
				})
			);
		});
	});
});
