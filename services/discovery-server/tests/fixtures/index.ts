import type { ServiceInstance } from "../../src/shared/types";

export const validServiceInstance = (
	overrides?: Partial<ServiceInstance>
): ServiceInstance => ({
	serviceName: "financial-scraper-service",
	instanceId: "test-instance-1",
	host: "192.168.1.10",
	port: 8444,
	version: "1.0.0",
	ttl: 30_000,
	protocol: "mtls",
	registeredAt: Date.now() - 1000,
	lastHeartbeat: Date.now() - 500,
	...overrides,
});

export const secondServiceInstance = (
	overrides?: Partial<ServiceInstance>
): ServiceInstance => ({
	serviceName: "financial-scraper-service",
	instanceId: "test-instance-2",
	host: "192.168.1.11",
	port: 8445,
	version: "1.0.0",
	ttl: 30_000,
	protocol: "mtls",
	registeredAt: Date.now() - 2000,
	lastHeartbeat: Date.now() - 1000,
	...overrides,
});

export const otherServiceInstance = (
	overrides?: Partial<ServiceInstance>
): ServiceInstance => ({
	serviceName: "message-delivery-service",
	instanceId: "msg-instance-1",
	host: "192.168.1.20",
	port: 8445,
	version: "1.0.0",
	ttl: 60_000,
	protocol: "mtls",
	registeredAt: Date.now() - 3000,
	lastHeartbeat: Date.now() - 1500,
	...overrides,
});

export const validRegisterPayload = {
	serviceName: "financial-scraper-service",
	ip: "192.168.1.10",
	port: 8444,
};

export const validTokenHeader = "valid-token-value";

export const mockTimestamp = 1_700_000_000_000;
