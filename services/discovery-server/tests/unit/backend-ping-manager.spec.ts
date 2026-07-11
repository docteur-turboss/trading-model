import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { RegistryBackend } from "@trading-model/common/contracts/service-registry.types";
import { REDIS_STATUS } from "@trading-model/common/persistence/redis-constants";
import { BackendPingManager } from "../../src/core/backend-ping-manager";
import type { PubSubInvalidator } from "../../src/core/pub-sub-invalidator";

function createMockPubSub(): PubSubInvalidator {
	return {
		client: {
			status: REDIS_STATUS.READY,
			ping: jest.fn().mockResolvedValue("PONG"),
			publish: jest.fn(),
			subscribe: jest.fn(),
			unsubscribe: jest.fn(),
			connect: jest.fn(),
			disconnect: jest.fn(),
			on: jest.fn(),
		},
		publish: jest.fn(),
		start: jest.fn(),
		stop: jest.fn(),
	} as unknown as PubSubInvalidator;
}

function createMockBackend(): RegistryBackend {
	return {
		registerInstance: jest.fn(),
		updateHeartbeat: jest.fn(),
		updateToken: jest.fn(),
		getInstances: jest.fn(),
		getInstance: jest.fn(),
		removeInstance: jest.fn(),
		listServiceNames: jest.fn(),
		dump: jest.fn(),
		validInstanceToken: jest.fn(),
		generateInstanceToken: jest.fn(),
		verifyInstanceName: jest.fn(),
		generateInstanceId: jest.fn(),
		start: jest.fn(),
		stop: jest.fn(),
	};
}

describe("BackendPingManager", () => {
	let pingManager: BackendPingManager;
	let mockBackend: RegistryBackend;
	let mockPubSub: PubSubInvalidator;

	beforeEach(() => {
		jest.clearAllMocks();
		mockBackend = createMockBackend();
		mockPubSub = createMockPubSub();
	});

	describe("isRedisBackend", () => {
		it("should return true when constructed with isRedisBackend=true", () => {
			pingManager = new BackendPingManager(mockBackend, mockPubSub, true);
			expect(pingManager.isRedisBackend()).toBe(true);
		});

		it("should return false when constructed with isRedisBackend=false", () => {
			pingManager = new BackendPingManager(mockBackend, mockPubSub, false);
			expect(pingManager.isRedisBackend()).toBe(false);
		});
	});

	describe("pingPubSub", () => {
		it("should ping when client status is READY", async () => {
			pingManager = new BackendPingManager(mockBackend, mockPubSub, false);
			await pingManager.pingPubSub();
			expect(mockPubSub.client.ping).toHaveBeenCalledTimes(1);
		});

		it("should log warn when ping fails", async () => {
			(mockPubSub.client.ping as jest.Mock).mockRejectedValue(
				new Error("connection lost")
			);
			pingManager = new BackendPingManager(mockBackend, mockPubSub, false);
			await pingManager.pingPubSub();

			const { logger } = jest.requireMock<{
				logger: { warn: jest.Mock };
			}>("@trading-model/common/config/logger");
			expect(logger.warn).toHaveBeenCalledWith(
				"PubSub ping failed — cache invalidation degraded"
			);
		});

		it("should skip ping when client status is not READY", async () => {
			const mockPubSubNotReady = createMockPubSub();
			mockPubSubNotReady.client.status = REDIS_STATUS.CLOSE;
			pingManager = new BackendPingManager(
				mockBackend,
				mockPubSubNotReady,
				false
			);
			await pingManager.pingPubSub();
			expect(mockPubSubNotReady.client.ping).not.toHaveBeenCalled();
		});
	});

	describe("pingBackend", () => {
		it("should call backend.ping when it exists and return true", async () => {
			const mockBackendWithPing = createMockBackend() as RegistryBackend & {
				ping: () => Promise<boolean>;
			};
			mockBackendWithPing.ping = jest.fn().mockResolvedValue(true);
			pingManager = new BackendPingManager(
				mockBackendWithPing,
				mockPubSub,
				false
			);
			const result = await pingManager.pingBackend();
			expect(result).toBe(true);
			expect(mockBackendWithPing.ping).toHaveBeenCalledTimes(1);
		});

		it("should return false when backend.ping returns false", async () => {
			const mockBackendWithPing = createMockBackend() as RegistryBackend & {
				ping: () => Promise<boolean>;
			};
			mockBackendWithPing.ping = jest.fn().mockResolvedValue(false);
			pingManager = new BackendPingManager(
				mockBackendWithPing,
				mockPubSub,
				false
			);
			const result = await pingManager.pingBackend();
			expect(result).toBe(false);
		});

		it("should return false when backend.ping throws", async () => {
			const mockBackendWithPing = createMockBackend() as RegistryBackend & {
				ping: () => Promise<boolean>;
			};
			mockBackendWithPing.ping = jest
				.fn()
				.mockRejectedValue(new Error("ping error"));
			pingManager = new BackendPingManager(
				mockBackendWithPing,
				mockPubSub,
				false
			);
			const result = await pingManager.pingBackend();
			expect(result).toBe(false);
		});

		it("should return false when no ping function and isRedisBackend is true", async () => {
			pingManager = new BackendPingManager(mockBackend, mockPubSub, true);
			const result = await pingManager.pingBackend();
			expect(result).toBe(false);
			expect(mockBackend.listServiceNames).not.toHaveBeenCalled();
		});

		it("should fall back to listServiceNames when no ping function and not redis", async () => {
			(mockBackend.listServiceNames as jest.Mock).mockResolvedValue([
				"test-service",
			]);
			pingManager = new BackendPingManager(mockBackend, mockPubSub, false);
			const result = await pingManager.pingBackend();
			expect(result).toBe(true);
			expect(mockBackend.listServiceNames).toHaveBeenCalledTimes(1);
		});

		it("should return false when listServiceNames throws", async () => {
			(mockBackend.listServiceNames as jest.Mock).mockRejectedValue(
				new Error("list failed")
			);
			pingManager = new BackendPingManager(mockBackend, mockPubSub, false);
			const result = await pingManager.pingBackend();
			expect(result).toBe(false);
		});
	});
});
