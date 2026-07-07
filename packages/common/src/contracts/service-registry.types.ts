import type { ServiceInstanceName } from "../config/services.types";
import type {
	AuthToken,
	InstanceId,
	IPAddress,
	Port,
	Region,
	ServiceId,
	Version,
} from "../domain/primitives";
import type {
	ServiceEndpoint,
	ServiceIdentity,
} from "../domain/service-identity";
import type { TokenValidation } from "../domain/token-validation";

export type Protocol = "http" | "https" | "mtls";

/** Payload for registering a new service instance in the registry. */
export interface ServiceRegisterPayload {
	name: ServiceInstanceName;
	address: IPAddress;
	port: Port;
	protocol: Protocol;
	env?: string;
	version?: Version;
}

/** Payload sent periodically to signal that a service instance is alive. */
export interface HeartbeatPayload extends ServiceIdentity {
	authToken: AuthToken;
}

/** Payload for querying registered service instances. */
export interface ServicesQueryPayload {
	serviceName: ServiceInstanceName;
	services: ServiceInstanceName[];
	onlyAlive: boolean;
}

/** A registered service instance with its connection metadata and health state. */
export interface ServiceInstance extends ServiceIdentity {
	lastHeartbeat: number;
	registeredAt: number;
	protocol: Protocol;
	port: Port;
	env?: string;
	ttl: number;
	ip: IPAddress;
	version: Version;
	/** Deployment region / datacenter for multi-region failover. */
	region?: Region;
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
	registerInstance(instance: ServiceInstance): Promise<string>;

	updateHeartbeat(id: ServiceIdentity): Promise<number | false>;

	updateToken(instanceId: InstanceId): Promise<string>;

	getInstances(serviceName: ServiceInstanceName): Promise<ServiceInstance[]>;

	getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined>;

	removeInstance(id: ServiceIdentity): Promise<boolean>;

	listServiceNames(): Promise<string[]>;

	dump(): Promise<Record<ServiceInstanceName, ServiceInstance[]>>;

	validInstanceToken(validation: TokenValidation): Promise<boolean>;

	generateInstanceToken(instanceId: InstanceId): string;

	generateInstanceId(endpoint: ServiceEndpoint): ServiceId;

	verifyInstanceName(serviceName: ServiceInstanceName): boolean;

	start(): void;

	stop(): void;
}
