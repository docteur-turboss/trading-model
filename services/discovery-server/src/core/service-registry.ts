import { createHmac, randomBytes } from "node:crypto";

import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { ServiceInstance } from "./types";
import { TokenService } from "./token-service";

/**
 * ServiceRegistry
 * ----------------------------
 *
 * Central in-memory registry for all service instances participating
 * in the service discovery system.
 *
 * Responsibilities:
 * - Maintain a mapping between logical service names and their instances
 * - Support multiple instances per service (horizontal scaling)
 * - Deduplicate registrations by instanceId
 * - Refresh metadata and heartbeats for existing instances
 * - Issue and validate instance-scoped authentication tokens
 * - Expose read operations for resolution and observability
 *
 * Design notes:
 * - This implementation is intentionally in-memory for simplicity
 * - The public API is designed to allow future replacement with
 *   a distributed backend (Redis, etcd, Consul)
 * - Lease expiration is enforced externally by the LeaseManager
 */
export class ServiceRegistry {
	/**
	 * -------------------------
	 * Internal Storage
	 * -------------------------
	 *
	 * services:
	 * - Map<serviceName, Map<instanceId, ServiceInstance>>
	 *
	 * token:
	 * - Map<instanceId, instanceToken>
	 *
	 * Tokens are stored separately to allow rotation and validation
	 * without mutating the instance metadata.
	 */
	private readonly _tokenService: TokenService;
	private _services: Map<string, Map<string, ServiceInstance>> = new Map();
	private _token: Map<string, string> = new Map();

	constructor(signingSecret?: string) {
		this._tokenService = new TokenService(
			signingSecret ?? randomBytes(32).toString("hex")
		);
	}

	/**
	 * -------------------------
	 * Instance Registration
	 * -------------------------
	 *
	 * Registers or updates a service instance.
	 *
	 * Behavior:
	 * - Idempotent: repeated registrations for the same instanceId
	 *   will update metadata and refresh timestamps
	 * - Generates (or regenerates) an authentication token
	 * - Initializes heartbeat and registration timestamps server-side
	 *
	 * Returns:
	 * - The effective ServiceInstance plus its issued token
	 */
	private _ensureBucket(serviceName: string): Map<string, ServiceInstance> {
		if (!this._services.has(serviceName)) {
			this._services.set(serviceName, new Map());
		}
		return this._services.get(serviceName)!;
	}

	private _mergeOrCreateInstance(
		instances: Map<string, ServiceInstance>,
		instance: ServiceInstance
	): ServiceInstance {
		const { instanceId } = instance;
		if (instances.has(instanceId)) {
			const existing = instances.get(instanceId)!;
			instances.set(instanceId, {
				...existing,
				...instance,
				lastHeartbeat: Date.now(),
			});
		} else {
			instances.set(instanceId, {
				...instance,
				registeredAt: Date.now(),
				lastHeartbeat: Date.now(),
			});
		}
		return instances.get(instanceId)!;
	}

	registerInstance(instance: ServiceInstance) {
		const { serviceName, instanceId } = instance;
		const instances = this._ensureBucket(serviceName);
		const token = this._tokenService.generateInstanceToken(instanceId);

		this._mergeOrCreateInstance(instances, instance);
		this._token.set(instanceId, token);

		return { ...instances.get(instanceId), token };
	}

	/**
	 * -------------------------
	 * Heartbeat Handling
	 * -------------------------
	 *
	 * Updates the heartbeat timestamp for a given instance.
	 *
	 * Called by the HeartbeatController.
	 *
	 * Returns:
	 * - The instance TTL if successful
	 * - false if the service or instance does not exist
	 */
	updateHeartbeat({ serviceName, instanceId }: ServiceIdentity): number | false {
		const service = this._services.get(serviceName);
		if (!service) {
			return false;
		}

		const instance = service.get(instanceId);
		if (!instance) {
			return false;
		}

		instance.lastHeartbeat = Date.now();
		service.set(instanceId, instance);

		return instance.ttl;
	}

	/**
	 * -------------------------
	 * Token Rotation
	 * -------------------------
	 *
	 * Generates and stores a new authentication token
	 * for an existing instance.
	 *
	 * The previously issued token is immediately invalidated.
	 */
	updateToken(instanceId: string): string {
		const newToken = this._tokenService.generateInstanceToken(instanceId);
		this._token.set(instanceId, newToken);
		return newToken;
	}

	/**
	 * -------------------------
	 * Query APIs
	 * -------------------------
	 */

	/**
	 * Returns all instances (alive or not) of a given service.
	 * Liveness filtering is handled by higher-level components.
	 */
	getInstances(serviceName: string): ServiceInstance[] {
		const service = this._services.get(serviceName);
		if (!service) {
			return [];
		}
		return [...service.values()];
	}

	/**
	 * Returns a single service instance by service name and instanceId.
	 */
	getInstance({
		serviceName,
		instanceId,
	}: ServiceIdentity): ServiceInstance | undefined {
		return this._services.get(serviceName)?.get(instanceId);
	}

	/**
	 * -------------------------
	 * Instance Removal
	 * -------------------------
	 *
	 * Removes an instance from the registry.
	 *
	 * Typically invoked by the LeaseManager when a lease expires.
	 * Automatically cleans up empty service entries.
	 */
	removeInstance({ serviceName, instanceId }: ServiceIdentity): boolean {
		const service = this._services.get(serviceName);
		if (!service) {
			return false;
		}

		const deleted = service.delete(instanceId);

		/**
		 * Remove the service bucket if no instances remain.
		 */
		if (service.size === 0) {
			this._services.delete(serviceName);
		}

		this._token.delete(instanceId);

		return deleted;
	}

	/**
	 * -------------------------
	 * Registry Introspection
	 * -------------------------
	 */

	/**
	 * Returns the list of all registered service names.
	 */
	listServiceNames(): string[] {
		return [...this._services.keys()];
	}

	/**
	 * Returns a full snapshot of the registry.
	 *
	 * Intended for:
	 * - admin endpoints
	 * - debugging
	 * - observability
	 *
	 * WARNING:
	 * Should not be exposed publicly without proper access controls.
	 */
	dump(): Record<string, ServiceInstance[]> {
		const snapshot: Record<string, ServiceInstance[]> = {};

		for (const [serviceName, instances] of this._services.entries()) {
			snapshot[serviceName] = [...instances.values()];
		}

		return snapshot;
	}

	/**
	 * -------------------------
	 * Token & ID Generation
	 * -------------------------
	 */

	/**
	 * Generates a cryptographically strong instance token.
	 *
	 * Token format:
	 *   <base64(instanceId)>.<base64(timestamp)>.<base64(nonce)>.<hmac>
	 *
	 * - instanceId identifies the service instance
	 * - timestamp records when the token was issued (base64-encoded)
	 * - nonce is a cryptographically random string ensuring uniqueness
	 * - hmac is an HMAC-SHA256 of the three fields above, keyed with the
	 *   fixed server-side signing secret
	 *
	 * The HMAC makes token forgery infeasible without access to the secret.
	 *
	 * This token is used for:
	 * - heartbeat authentication
	 * - token rotation
	 */
	generateInstanceToken(instanceId: string): string {
		return this._tokenService.generateInstanceToken(instanceId);
	}

	generateInstanceId(
		serviceName: string,
		address: string,
		port: number
	): string {
		return createHmac("sha256", randomBytes(32).toString("hex"))
			.update(`${serviceName}-${address}:${port}-${Date.now()}`)
			.digest("base64");
	}

	validInstanceToken(token: string, instanceId: string): boolean {
		const storedToken = this._token.get(instanceId);
		return this._tokenService.validInstanceToken(token, instanceId, storedToken);
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._tokenService.verifyInstanceName(serviceName);
	}
}
