import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { JsonObject } from "@trading-model/common/domain/primitives";
import { toServiceId } from "@trading-model/common/domain/primitives";
import type { DiscoveryWsMessage } from "@trading-model/validation/adapters/inbound/discovery-ws-message.types";
import { DiscoveryWsMessageType } from "@trading-model/validation/adapters/inbound/discovery-ws-message.types";
import { handleCacheInvalidation } from "../../src/application/cache-invalidation-handler";
import type { IServiceCache } from "../../src/domain/discovery/service-cache.interface";

describe("handleCacheInvalidation", () => {
	let serviceCache: jest.Mocked<IServiceCache>;

	beforeEach(() => {
		serviceCache = {
			get: jest.fn(),
			set: jest.fn(),
			getVersion: jest.fn(),
			delete: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			clear: jest.fn(),
			entries: jest.fn(),
			setCircuitState: jest.fn(),
			getCircuitState: jest.fn(),
			deleteCircuitState: jest.fn(),
			close: jest.fn(),
		} as jest.Mocked<IServiceCache>;
	});

	it("should ignore non-cache-invalidate messages", () => {
		const msg = {
			type: DiscoveryWsMessageType.Heartbeat as DiscoveryWsMessage["type"],
			payload: {} as JsonObject,
		};
		handleCacheInvalidation(msg, serviceCache);
		expect(serviceCache.delete).not.toHaveBeenCalled();
	});

	it("should ignore cache.invalidate without serviceName", () => {
		const msg = {
			type: DiscoveryWsMessageType.CacheInvalidate,
			payload: {} as JsonObject,
		};
		handleCacheInvalidation(msg, serviceCache);
		expect(serviceCache.delete).not.toHaveBeenCalled();
	});

	it("should invalidate cache for valid service name", () => {
		const msg = {
			type: DiscoveryWsMessageType.CacheInvalidate,
			payload: { serviceName: "user-service" } as unknown as JsonObject,
		};
		handleCacheInvalidation(msg, serviceCache);
		expect(serviceCache.delete).toHaveBeenCalledWith(
			toServiceId("user-service")
		);
	});

	it("should handle invalidate rejection gracefully", () => {
		serviceCache.delete.mockRejectedValue(new Error("cache error"));
		const msg = {
			type: DiscoveryWsMessageType.CacheInvalidate,
			payload: { serviceName: "user-service" } as unknown as JsonObject,
		};
		handleCacheInvalidation(msg, serviceCache);
		expect(serviceCache.delete).toHaveBeenCalledWith(
			toServiceId("user-service")
		);
	});
});
