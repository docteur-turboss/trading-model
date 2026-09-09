import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
	IPAddress,
	Port,
	toDurationMs,
	toInstanceId,
	toServiceId,
	toVersion,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { Protocol } from "@trading-model/validation/adapters/outbound/service-registry.types";
import type { ServiceHealthChecker } from "../../src/adapters/outbound/discovery/service-health-checker";
import { CacheHealthRefresher } from "../../src/application/discovery/cache-health-refresher";
import type { ServiceInstance } from "../../src/domain/client/type";
import type { IServiceCache } from "../../src/domain/discovery/service-cache.interface";

function makeInstance(overrides?: Partial<ServiceInstance>): ServiceInstance {
	return {
		serviceName: toServiceId("svc"),
		instanceId: toInstanceId("i-1"),
		host: IPAddress.of("127.0.0.1"),
		port: Port.of(8080),
		version: toVersion("1.0.0"),
		ttl: toDurationMs(30000),
		protocol: Protocol.Http,
		registeredAt: UnixTimestamp.now(),
		lastHeartbeat: UnixTimestamp.now(),
		...overrides,
	};
}

describe("CacheHealthRefresher", () => {
	let serviceCache: jest.Mocked<IServiceCache>;
	let healthChecker: jest.Mocked<ServiceHealthChecker>;
	let refresher: CacheHealthRefresher;

	beforeEach(() => {
		serviceCache = {
			get: jest.fn(),
			set: jest.fn(),
			getVersion: jest.fn(),
			delete: jest.fn(),
			clear: jest.fn(),
			entries: jest.fn(),
			setCircuitState: jest.fn(),
			getCircuitState: jest.fn(),
			deleteCircuitState: jest.fn(),
			close: jest.fn(),
		} as jest.Mocked<IServiceCache>;
		healthChecker = {
			isHealthy: jest.fn(),
		} as unknown as jest.Mocked<ServiceHealthChecker>;
		refresher = new CacheHealthRefresher(serviceCache, healthChecker, 3000);
	});

	it("should have a schedule based on check interval", () => {
		expect(refresher.schedule).toBe("*/3 * * * * *");
	});

	it("should skip execution when already running", async () => {
		serviceCache.entries.mockImplementation(() => {
			void refresher.execute();
			return Promise.resolve([]);
		});
		await refresher.execute();
		expect(serviceCache.entries).toHaveBeenCalledTimes(1);
	});

	it("should return early when no entries", async () => {
		serviceCache.entries.mockResolvedValue([]);
		await refresher.execute();
		expect(healthChecker.isHealthy).not.toHaveBeenCalled();
	});

	it("should check health and invalidate unhealthy entries", async () => {
		const unhealthy = makeInstance({
			serviceName: toServiceId("unhealthy-svc"),
			instanceId: toInstanceId("i-2"),
		});
		serviceCache.entries.mockResolvedValue([
			{
				serviceName: toServiceId("healthy-svc"),
				instance: makeInstance({
					serviceName: toServiceId("healthy-svc"),
					instanceId: toInstanceId("i-1"),
				}),
			},
			{
				serviceName: toServiceId("healthy-svc2"),
				instance: makeInstance({
					serviceName: toServiceId("healthy-svc2"),
					instanceId: toInstanceId("i-3"),
				}),
			},
			{
				serviceName: toServiceId("healthy-svc3"),
				instance: makeInstance({
					serviceName: toServiceId("healthy-svc3"),
					instanceId: toInstanceId("i-4"),
				}),
			},
			{ serviceName: toServiceId("unhealthy-svc"), instance: unhealthy },
		]);
		healthChecker.isHealthy.mockResolvedValue(true);
		await refresher.execute();
		await refresher.execute();
		await refresher.execute();
		healthChecker.isHealthy.mockResolvedValue(false);
		await refresher.execute();
		expect(serviceCache.delete).toHaveBeenCalledWith(
			toServiceId("unhealthy-svc")
		);
	});

	it("should log errors from health checks", async () => {
		const inst = makeInstance();
		serviceCache.entries.mockResolvedValue([
			{ serviceName: toServiceId("svc"), instance: inst },
		]);
		healthChecker.isHealthy.mockRejectedValue(new Error("check error"));
		await refresher.execute();
		expect(serviceCache.delete).not.toHaveBeenCalled();
	});

	it("should reset offset when entries length changes", async () => {
		const inst = makeInstance();
		serviceCache.entries.mockResolvedValue([
			{ serviceName: toServiceId("svc"), instance: inst },
		]);
		healthChecker.isHealthy.mockResolvedValue(true);
		await refresher.execute();
		await refresher.execute();
		expect(healthChecker.isHealthy).toHaveBeenCalledTimes(2);
	});
});
