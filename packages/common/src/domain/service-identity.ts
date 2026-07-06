import type {
	InstanceId,
	IPAddress,
	Port,
	Region,
	ServiceId,
} from "./primitives";

/** Uniquely identifies a service instance in the distributed system. */
export interface ServiceIdentity {
	serviceName: ServiceId;
	instanceId: InstanceId;
	/** Deployment region for geo-affinity routing. */
	region?: Region;
}

/** Host and port pair for network endpoints. */
export interface HostPort {
	host: IPAddress;
	port: Port;
}

/** Identifies a service by name, network address, and port. */
export interface ServiceEndpoint {
	serviceName: ServiceId;
	address: IPAddress;
	port: Port;
}
