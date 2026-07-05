export type Protocol = "http" | "https" | "mtls";

/** Payload for registering a new service instance in the registry. */
export interface ServiceRegisterPayload {
	name: string;
	address: string;
	port: number;
	protocol: Protocol;
	env?: string;
	version?: string;
}

/** Payload sent periodically to signal that a service instance is alive. */
export interface HeartbeatPayload {
	serviceName: string;
	instanceId: string;
	authToken: string;
}

/** Payload for querying registered service instances. */
export interface ServicesQueryPayload {
	serviceName: string;
	services: string[];
	onlyAlive: boolean;
}

/** A registered service instance with its connection metadata and health state. */
export interface ServiceInstance {
	lastHeartbeat: number;
	registeredAt: number;
	serviceName: string;
	instanceId: string;
	protocol: Protocol;
	port: number;
	env?: string;
	ttl: number;
	ip: string;
	version: string;
	/** Deployment region / datacenter for multi-region failover. */
	region?: string;
}

/**
 * Abstract backend interface for ServiceInstance storage.
 *
 * All methods return Promises to support both synchronous
 * (InMemoryRegistryBackend) and asynchronous (RedisRegistryBackend)
 * implementations transparently.
 *
 * Implementations:
 * - InMemoryRegistryBackend – single-node, ephemeral (dev / single instance)
 * - RedisRegistryBackend – distributed, persistent (multi-node / multi-region)
 *
 * Design goal: controllers and routes are decoupled from storage;
 * swapping the backend requires no changes above the core/ layer.
 */
export interface RegistryBackend {
	/** Register or update an instance. Returns the issued token. */
	registerInstance(instance: ServiceInstance): Promise<string>;

	/** Update the heartbeat timestamp. Returns TTL or false. */
	updateHeartbeat(
		serviceName: string,
		instanceId: string
	): Promise<number | false>;

	/** Rotate the token for an instance. Returns the new token. */
	updateToken(instanceId: string): Promise<string>;

	/** Return all instances of a service (alive or not). */
	getInstances(serviceName: string): Promise<ServiceInstance[]>;

	/** Return a single instance by name + id. */
	getInstance(
		serviceName: string,
		instanceId: string
	): Promise<ServiceInstance | undefined>;

	/** Remove an instance. Returns true if deleted. */
	removeInstance(serviceName: string, instanceId: string): Promise<boolean>;

	/** List all registered service names. */
	listServiceNames(): Promise<string[]>;

	/** Full registry snapshot. */
	dump(): Promise<Record<string, ServiceInstance[]>>;

	/** Validate a token for a given instance. */
	validInstanceToken(token: string, instanceId: string): Promise<boolean>;

	/** Generate a new instance token. */
	generateInstanceToken(instanceId: string): string;

	/** Verify a service name is in the allowed catalog. */
	verifyInstanceName(serviceName: string): boolean;

	/** Start any background maintenance (cleanup, expiry). */
	start(): void;

	/** Stop background maintenance gracefully. */
	stop(): void;
}
