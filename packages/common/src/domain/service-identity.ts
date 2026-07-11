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

/** Builds a compound string key from a service identity. */
export function toServiceIdentityKey(identity: ServiceIdentity): string {
	return `${identity.serviceName}:${identity.instanceId}`;
}

/** Host and port pair for network endpoints. */
export interface HostPort {
	host: IPAddress;
	port: Port;
}

/** Formats a HostPort as "host:port". */
export function toHostPortAddress(hp: HostPort): string {
	return `${hp.host}:${hp.port}`;
}

/** Identifies a service by name, network address, and port. */
export interface ServiceEndpoint extends HostPort {
	serviceName: ServiceId;
}
