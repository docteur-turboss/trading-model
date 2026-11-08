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
import type { ServiceInstance } from "../../src/shared/types";

export const validServiceInstance = (
	overrides?: Partial<ServiceInstance>
): ServiceInstance => ({
	serviceName: "financial-scraper-service" as ServiceId,
	instanceId: "test-instance-1" as InstanceId,
	host: "192.168.1.10" as IPAddress,
	port: 8444 as Port,
	version: "1.0.0" as Version,
	ttl: 30_000 as DurationMs,
	protocol: "mtls" as unknown as Protocol,
	registeredAt: (Date.now() - 1000) as UnixTimestamp,
	lastHeartbeat: (Date.now() - 500) as UnixTimestamp,
	...overrides,
});

export const secondServiceInstance = (
	overrides?: Partial<ServiceInstance>
): ServiceInstance => ({
	serviceName: "financial-scraper-service" as ServiceId,
	instanceId: "test-instance-2" as InstanceId,
	host: "192.168.1.11" as IPAddress,
	port: 8445 as Port,
	version: "1.0.0" as Version,
	ttl: 30_000 as DurationMs,
	protocol: "mtls" as unknown as Protocol,
	registeredAt: (Date.now() - 2000) as UnixTimestamp,
	lastHeartbeat: (Date.now() - 1000) as UnixTimestamp,
	...overrides,
});

export const otherServiceInstance = (
	overrides?: Partial<ServiceInstance>
): ServiceInstance => ({
	serviceName: "message-delivery-service" as ServiceId,
	instanceId: "msg-instance-1" as InstanceId,
	host: "192.168.1.20" as IPAddress,
	port: 8445 as Port,
	version: "1.0.0" as Version,
	ttl: 60_000 as DurationMs,
	protocol: "mtls" as unknown as Protocol,
	registeredAt: (Date.now() - 3000) as UnixTimestamp,
	lastHeartbeat: (Date.now() - 1500) as UnixTimestamp,
	...overrides,
});

export const validRegisterPayload = {
	serviceName: "financial-scraper-service",
	ip: "192.168.1.10",
	port: 8444,
};
