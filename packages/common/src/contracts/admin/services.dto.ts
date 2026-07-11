import type { ServiceInstanceName } from "../../config/services.types";
import type {
	InstanceId,
	ISODateTime,
	ServiceId,
	Version,
} from "../../domain/primitives";
import type { HostPort } from "../../domain/service-identity";

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

export interface AdminServiceInstance extends HostPort {
	instanceId: InstanceId;
	version: Version;
	heartbeat: ISODateTime;
	status: ServiceStatus;
}

export interface TopologyLink {
	source: ServiceId;
	target: ServiceId;
	status: ServiceStatus;
}
