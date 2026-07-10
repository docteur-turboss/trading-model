import type { ServiceInstanceName } from "../config/services.types";
import type {
	AuthToken,
	DurationMs,
	Environment,
	InstanceId,
	IPAddress,
	Port,
	Region,
	ServiceId,
	UnixTimestamp,
	Version,
} from "../domain/primitives";
import type {
	HostPort,
	ServiceEndpoint,
	ServiceIdentity,
} from "../domain/service-identity";
import type { TokenValidation } from "../domain/token-validation";

export enum Protocol {
	Http = "http",
	Https = "https",
	Mtls = "mtls",
}

/** Payload for registering a new service instance in the registry. */
export interface ServiceRegisterPayload {
	serviceName: ServiceInstanceName;
	address: IPAddress;
	port: Port;
	protocol: Protocol;
	env?: Environment;
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
export interface ServiceInstance extends ServiceIdentity, HostPort {
	lastHeartbeat: UnixTimestamp;
	registeredAt: UnixTimestamp;
	protocol: Protocol;
	env?: Environment;
	ttl: DurationMs;
	version: Version;
	/** Deployment region / datacenter for multi-region failover. */
	region?: Region;
}

/**
 * Role interface: service instance registration and heartbeat lifecycle.
 */
export interface IInstanceRegistration {
	registerInstance(instance: ServiceInstance): Promise<string>;
	updateHeartbeat(id: ServiceIdentity): Promise<number | false>;
	removeInstance(id: ServiceIdentity): Promise<boolean>;
}

/**
 * Role interface: querying registered instances and service names.
 */
export interface IInstanceQuery {
	getInstances(serviceName: ServiceInstanceName): Promise<ServiceInstance[]>;
	getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined>;
	listServiceNames(): Promise<string[]>;
	dump(): Promise<Record<ServiceInstanceName, ServiceInstance[]>>;
}

/**
 * Role interface: authentication token and instance ID management.
 */
export interface ITokenManager {
	updateToken(instanceId: InstanceId): Promise<string>;
	validInstanceToken(validation: TokenValidation): Promise<boolean>;
	generateInstanceToken(instanceId: InstanceId): string;
	generateInstanceId(endpoint: ServiceEndpoint): ServiceId;
	verifyInstanceName(serviceName: ServiceInstanceName): boolean;
}

/**
 * Role interface: backend lifecycle (start / stop).
 */
export interface ILifecycle {
	start(): void;
	stop(): void;
}

/**
 * Aggregate backend interface for ServiceInstance storage.
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
 *
 * For narrower contracts, use the role interfaces directly:
 * - {@link IInstanceRegistration}
 * - {@link IInstanceQuery}
 * - {@link ITokenManager}
 * - {@link ILifecycle}
 */
export interface RegistryBackend
	extends IInstanceRegistration,
		IInstanceQuery,
		ITokenManager,
		ILifecycle {}
