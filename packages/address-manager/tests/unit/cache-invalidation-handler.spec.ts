import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { JsonObject } from "@trading-model/common/domain/primitives";
import { toServiceId } from "@trading-model/common/domain/primitives";
import type { DiscoveryWsMessage } from "@trading-model/validation/contracts/discovery-ws-message.types";
import { DiscoveryWsMessageType } from "@trading-model/validation/contracts/discovery-ws-message.types";
import { CacheInvalidationHandler } from "../../src/cache-invalidation-handler";
import type { IServiceCache } from "../../src/discovery/service-cache.interface";

describe("CacheInvalidationHandler", () => {
	let handler: CacheInvalidationHandler;
	let serviceCache: jest.Mocked<IServiceCache>;

	beforeEach(() => {
		handler = new CacheInvalidationHandler();
		serviceCache = {
			get: jest.fn(),
			set: jest.fn(),
			getVersion: jest.fn(),
			invalidate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			clear: jest.fn(),
			entries: jest.fn(),
			setCircuitState: jest.fn(),
			getCircuitState: jest.fn(),
			deleteCircuitState: jest.fn(),
			stop: jest.fn(),
		} as jest.Mocked<IServiceCache>;
	});

	it("should ignore non-cache-invalidate messages", () => {
		const msg = {
			type: DiscoveryWsMessageType.Heartbeat as DiscoveryWsMessage["type"],
			payload: {} as JsonObject,
		};
		handler.handle(msg, serviceCache);
		expect(serviceCache.invalidate).not.toHaveBeenCalled();
	});

	it("should ignore cache.invalidate without serviceName", () => {
		const msg = {
			type: DiscoveryWsMessageType.CacheInvalidate,
			payload: {} as JsonObject,
		};
		handler.handle(msg, serviceCache);
		expect(serviceCache.invalidate).not.toHaveBeenCalled();
	});

	it("should invalidate cache for valid service name", () => {
		const msg = {
			type: DiscoveryWsMessageType.CacheInvalidate,
			payload: { serviceName: "user-service" } as unknown as JsonObject,
		};
		handler.handle(msg, serviceCache);
		expect(serviceCache.invalidate).toHaveBeenCalledWith(
			toServiceId("user-service")
		);
	});

	it("should handle invalidate rejection gracefully", () => {
		serviceCache.invalidate.mockRejectedValue(new Error("cache error"));
		const msg = {
			type: DiscoveryWsMessageType.CacheInvalidate,
			payload: { serviceName: "user-service" } as unknown as JsonObject,
		};
		handler.handle(msg, serviceCache);
		expect(serviceCache.invalidate).toHaveBeenCalledWith(
			toServiceId("user-service")
		);
	});
});
