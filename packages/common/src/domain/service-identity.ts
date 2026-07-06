/** Uniquely identifies a service instance in the distributed system. */
export interface ServiceIdentity {
	serviceName: string;
	instanceId: string;
}
