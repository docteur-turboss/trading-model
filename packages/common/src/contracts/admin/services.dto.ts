import type { InstanceId, IPAddress, Port, ServiceId } from "../../domain/primitives";

export enum ServiceStatus {
	Healthy = "healthy",
	Degraded = "degraded",
	Down = "down",
}

export interface ServiceRegistryEntry {
	serviceName: string;
	instances: ServiceInstance[];
	topology?: TopologyLink[];
}

export interface ServiceInstance {
	instanceId: InstanceId;
	host: IPAddress;
	port: Port;
	version: string;
	heartbeat: string;
	status: ServiceStatus;
}

export interface TopologyLink {
	source: ServiceId;
	target: ServiceId;
	status: ServiceStatus;
}
