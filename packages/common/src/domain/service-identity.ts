import type { IPAddress, Port } from "./primitives";

/** Uniquely identifies a service instance in the distributed system. */
export interface ServiceIdentity {
	serviceName: string;
	instanceId: string;
	/** Deployment region for geo-affinity routing. */
	region?: string;
}

/** Identifies a service by name, network address, and port. */
export interface ServiceEndpoint {
	serviceName: string;
	address: IPAddress;
	port: Port;
}
