/** Uniquely identifies a service instance in the distributed system. */
export interface ServiceIdentity {
	serviceName: string;
	instanceId: string;
}

/** Identifies a service by name, network address, and port. */
export interface ServiceEndpoint {
	serviceName: string;
	address: string;
	port: number;
}
