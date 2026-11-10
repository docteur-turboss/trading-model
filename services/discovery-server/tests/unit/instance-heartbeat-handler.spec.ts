import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Protocol } from "@trading-model/contracts/service-registry-types";
import type {
	DurationMs,
	InstanceId,
	IPAddress,
	Port,
	ServiceId,
	UnixTimestamp,
	Version,
} from "@trading-model/primitives/primitives";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
		debug: jest.fn<(...args: any[]) => any>(),
	},
}));

interface MockMulti {
	sadd: jest.Mock<(...args: any[]) => any>;
	set: jest.Mock<(...args: any[]) => any>;
	srem: jest.Mock<(...args: any[]) => any>;
	del: jest.Mock<(...args: any[]) => any>;
	exec: jest.Mock<(...args: any[]) => any>;
}

interface MockRedisInstance {
	on: jest.Mock<(...args: any[]) => any>;
	set: jest.Mock<(...args: any[]) => any>;
	get: jest.Mock<(...args: any[]) => any>;
	sismember: jest.Mock<(...args: any[]) => any>;
	multi: jest.Mock<(...args: any[]) => any>;
	eval: jest.Mock<(...args: any[]) => any>;
}

const MOCK_MULTI: MockMulti = {
	sadd: jest.fn<(...args: any[]) => any>().mockReturnThis(),
	set: jest.fn<(...args: any[]) => any>().mockReturnThis(),
	srem: jest.fn<(...args: any[]) => any>().mockReturnThis(),
	del: jest.fn<(...args: any[]) => any>().mockReturnThis(),
	exec: jest.fn<(...args: any[]) => any>().mockResolvedValue([[null, "OK"]]),
};

const MOCK_REDIS = Object.assign(
	jest.fn<(...args: any[]) => any>().mockReturnThis(),
	{
		on: jest.fn<(...args: any[]) => any>().mockReturnThis(),
		set: jest.fn<(...args: any[]) => any>().mockResolvedValue("OK"),
		get: jest.fn<(...args: any[]) => any>().mockResolvedValue(null),
		sismember: jest.fn<(...args: any[]) => any>().mockResolvedValue(1),
		multi: jest.fn<(...args: any[]) => any>().mockReturnValue(MOCK_MULTI),
		eval: jest.fn<(...args: any[]) => any>().mockResolvedValue(1),
	}
) as unknown as jest.Mock<(...args: any[]) => any> & MockRedisInstance;

jest.mock("ioredis", () => ({
	__esModule: true,
	default: jest.fn((..._args: any[]) => MOCK_REDIS),
	Redis: jest.fn((..._args: any[]) => MOCK_REDIS),
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
			serviceName: "financial-scraper" as never,
			instanceId: "i1" as never,
		};
		const mockInstance: ServiceInstance = {
			serviceName: "financial-scraper" as ServiceId,
			instanceId: "i1" as InstanceId,
			host: "192.168.1.10" as IPAddress,
			port: 8444 as Port,
			version: "1.0.0" as Version,
			ttl: 30000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			registeredAt: (Date.now() - 1000) as UnixTimestamp,
			lastHeartbeat: (Date.now() - 500) as UnixTimestamp,
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
				"service:financial-scraper:instances",
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
				lastHeartbeat: futureTime as UnixTimestamp,
			};
			mockReader.getMetadata.mockResolvedValue(pastInstance);

			await handler.updateHeartbeat(identity);

			const stored = JSON.parse(MOCK_REDIS.eval.mock.calls[0][6] as string);
			expect(stored.lastHeartbeat).toBe(futureTime);
		});

		it("should log a warning and return false when Redis write fails", async () => {
			const { logger } = jest.requireMock(
				"@trading-model/http/infrastructure/logger"
			) as { logger: { warn: jest.Mock<(...args: any[]) => any> } };

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
