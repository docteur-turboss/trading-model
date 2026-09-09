import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
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
}) as unknown as jest.Mock & MockRedisInstance;

jest.mock("ioredis", () => ({
	__esModule: true,
	default: jest.fn(() => MOCK_REDIS),
	Redis: jest.fn(() => MOCK_REDIS),
}));

import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { ServiceInstance } from "@trading-model/validation/adapters/outbound/service-registry.types";
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
			expect(MOCK_MULTI.set).toHaveBeenCalledTimes(2);
			expect(MOCK_MULTI.set).toHaveBeenCalledWith(
				"instance:i1:metadata",
				expect.any(String)
			);
			expect(MOCK_MULTI.set).toHaveBeenCalledWith(
				"instance:i1:updatedBy",
				expect.any(String)
			);
			expect(MOCK_MULTI.exec).toHaveBeenCalled();
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

			const metadataSetCall = MOCK_MULTI.set.mock.calls.find(
				(c: string[]) => c[0] === "instance:i1:metadata"
			);
			const stored = JSON.parse(metadataSetCall![1]);
			expect(stored.lastHeartbeat).toBe(futureTime);
		});

		it("should log a warning and return false when Redis write fails", async () => {
			const { logger } = jest.requireMock(
				"@trading-model/common/config/logger"
			) as { logger: { warn: jest.Mock } };

			MOCK_REDIS.sismember.mockResolvedValue(1);
			mockReader.getMetadata.mockResolvedValue(mockInstance);
			MOCK_MULTI.exec.mockRejectedValue(new Error("Redis write error"));

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
