import { createHmac, randomBytes } from "node:crypto";

import type { ServiceEndpoint, ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { ServiceInstance } from "./types";
import { RegistryStore } from "./registry-store";
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
	private readonly _tokenService: TokenService;
	private readonly _store: RegistryStore;

	constructor(signingSecret?: string) {
		this._tokenService = new TokenService(
			signingSecret ?? randomBytes(32).toString("hex")
		);
		this._store = new RegistryStore(this._tokenService);
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
	registerInstance(instance: ServiceInstance) {
		const { instance: storedInstance, token } =
			this._store.registerInstance(instance);
		return { ...storedInstance, token };
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
	updateHeartbeat(identity: ServiceIdentity): number | false {
		return this._store.updateHeartbeat(identity);
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
		this._store.storeToken(instanceId, newToken);
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
		return this._store.getInstances(serviceName);
	}

	/**
	 * Returns a single service instance by service name and instanceId.
	 */
	getInstance(identity: ServiceIdentity): ServiceInstance | undefined {
		return this._store.getInstance(identity);
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
	removeInstance(identity: ServiceIdentity): boolean {
		return this._store.removeInstance(identity);
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
		return this._store.listServiceNames();
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
		return this._store.dump();
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

	generateInstanceId({
		serviceName,
		address,
		port,
	}: ServiceEndpoint): string {
		return createHmac("sha256", randomBytes(32).toString("hex"))
			.update(`${serviceName}-${address}:${port}-${Date.now()}`)
			.digest("base64");
	}

	validInstanceToken(token: string, instanceId: string): boolean {
		const storedToken = this._store.getStoredToken(instanceId);
		return this._tokenService.validInstanceToken(
			token,
			instanceId,
			storedToken
		);
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._tokenService.verifyInstanceName(serviceName);
	}
}
