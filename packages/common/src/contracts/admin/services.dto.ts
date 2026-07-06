import type { ServiceInstanceName } from "../../config/services.types";
import type {
	InstanceId,
	IPAddress,
	Port,
	ServiceId,
	Version,
} from "../../domain/primitives";

export enum ServiceStatus {
	Healthy = "healthy",
	Degraded = "degraded",
	Down = "down",
}

export interface ServiceRegistryEntry {
	serviceName: ServiceInstanceName;
	instances: AdminServiceInstance[];
	topology?: TopologyLink[];
}

export interface AdminServiceInstance {
	instanceId: InstanceId;
	host: IPAddress;
	port: Port;
	version: Version;
	heartbeat: string;
	status: ServiceStatus;
}

export interface TopologyLink {
	source: ServiceId;
	target: ServiceId;
	status: ServiceStatus;
}
