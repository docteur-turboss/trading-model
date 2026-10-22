import type {
	InstanceId,
	IPAddress,
	Port,
	Region,
	ServiceId,
	Version,
} from "./primitives";

/** Uniquely identifies a service instance in the distributed system. */
export interface ServiceIdentity {
	serviceName: ServiceId;
	instanceId: InstanceId;
	/** Deployment region for geo-affinity routing. */
	region?: Region;
}

export namespace ServiceIdentity {
	/** Builds a compound string key from a service identity. */
	export function toKey(identity: ServiceIdentity): string {
		return `${identity.serviceName}:${identity.instanceId}`;
	}
}

/** Extends ServiceIdentity with a software version. */
export interface ServiceInstanceIdentity extends ServiceIdentity {
	version: Version;
}

/** Host and port pair for network endpoints. */
export interface HostPort {
	host: IPAddress;
	port: Port;
}

export namespace HostPort {
	/** Formats a HostPort as "host:port". */
	export function toAddress(hp: HostPort): string {
		return `${hp.host}:${hp.port}`;
	}
}

/** Identifies a service by name, network address, and port. */
export interface ServiceEndpoint extends HostPort {
	serviceName: ServiceId;
}
