import type { IPAddress, Port } from "../../domain/primitives";

export interface ServiceRegistryEntry {
	serviceName: string;
	instances: ServiceInstance[];
	topology?: TopologyLink[];
}

export interface ServiceInstance {
	instanceId: string;
	host: IPAddress;
	port: Port;
	version: string;
	heartbeat: string;
	status: "healthy" | "degraded" | "down";
}

export interface TopologyLink {
	source: string;
	target: string;
	status: "healthy" | "degraded" | "down";
}
