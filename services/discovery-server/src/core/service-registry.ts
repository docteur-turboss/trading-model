import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

import { ServiceInstanceName } from '@trading-model/common/config/services.types';
import { generateRandomStr } from '@trading-model/common/crypto/random';

import { ServiceInstance } from './types';

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
  private readonly signingSecret: string;
  private services: Map<string, Map<string, ServiceInstance>> = new Map();
  private token: Map<string, string> = new Map();

  constructor(signingSecret?: string) {
    this.signingSecret = signingSecret ?? randomBytes(32).toString('hex');
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
    const { serviceName, instanceId } = instance;

    /**
     * Ensure the service bucket exists.
     */
    if (!this.services.has(serviceName)) {
      this.services.set(serviceName, new Map());
    }

    const instances = this.services.get(serviceName)!;

    /**
     * Generate a new instance-scoped token.
     * Token generation is intentionally server-controlled.
     */
    const token = this.generateInstanceToken(instanceId);

    /**
     * If the instance already exists, merge metadata
     * and refresh the heartbeat.
     */
    if (instances.has(instanceId)) {
      const existing = instances.get(instanceId)!;

      instances.set(instanceId, {
        ...existing,
        ...instance,
        lastHeartbeat: Date.now(),
      });
    } else {
      /**
       * New instance registration.
       */
      instances.set(instanceId, {
        ...instance,
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
      });
    }

    /**
     * Persist or rotate the instance token.
     */
    this.token.set(instanceId, token);

    /**
     * Return the registered instance together with its token.
     */
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
  updateHeartbeat(serviceName: string, instanceId: string): number | false {
    const service = this.services.get(serviceName);
    if (!service) return false;

    const instance = service.get(instanceId);
    if (!instance) return false;

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
    const newToken = this.generateInstanceToken(instanceId);
    this.token.set(instanceId, newToken);
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
    const service = this.services.get(serviceName);
    if (!service) return [];
    return [...service.values()];
  }

  /**
   * Returns a single service instance by service name and instanceId.
   */
  getInstance(serviceName: string, instanceId: string): ServiceInstance | undefined {
    return this.services.get(serviceName)?.get(instanceId);
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
  removeInstance(serviceName: string, instanceId: string): boolean {
    const service = this.services.get(serviceName);
    if (!service) return false;

    const deleted = service.delete(instanceId);

    /**
     * Remove the service bucket if no instances remain.
     */
    if (service.size === 0) {
      this.services.delete(serviceName);
    }

    this.token.delete(instanceId);

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
    return [...this.services.keys()];
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

    for (const [serviceName, instances] of this.services.entries()) {
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
    const encodedId = Buffer.from(instanceId, 'utf8').toString('base64url');
    const timestamp = Buffer.from(`${Date.now()}`, 'utf8').toString('base64url');
    const nonce = generateRandomStr();

    const hmac = createHmac('sha256', this.signingSecret)
      .update(`${encodedId}.${timestamp}.${nonce}`)
      .digest('base64url');

    return `${encodedId}.${timestamp}.${nonce}.${hmac}`;
  }

  /**
   * Generates a unique instanceId.
   *
   * Used when a client does not provide an explicit instanceId.
   * Ensures uniqueness across restarts and rescheduling.
   */
  generateInstanceId(serviceName: string, address: string, port: number): string {
    return createHmac('sha256', generateRandomStr())
      .update(`${serviceName}-${address}:${port}-${Date.now()}`)
      .digest('base64');
  }

  /**
   * Validates an instance token by verifying its HMAC signature and
   * comparing against the stored token for revocation detection.
   *
   * Two-layer validation:
   * 1. HMAC verification — ensures the token was signed by this server
   *    (prevents forged tokens even if the token map is compromised)
   * 2. Stored token comparison — detects revoked tokens after rotation
   *    (an old token is cryptographically valid but no longer authorized)
   *
   * Used by protected endpoints (heartbeat, token rotation).
   */
  validInstanceToken(token: string, instanceId: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 4) return false;

    const [encodedId, timestamp, nonce, signature] = parts;

    const decodedId = Buffer.from(encodedId, 'base64url').toString('utf8');
    if (decodedId !== instanceId) return false;

    const expectedHmac = createHmac('sha256', this.signingSecret)
      .update(`${encodedId}.${timestamp}.${nonce}`)
      .digest('base64url');

    try {
      if (!timingSafeEqual(Buffer.from(expectedHmac), Buffer.from(signature))) {
        return false;
      }
    } catch {
      return false;
    }

    const storedToken = this.token.get(instanceId);
    return storedToken === token;
  }

  /**
   * Validates that the service name is part of the
   * allowed service catalog.
   *
   * Prevents arbitrary or rogue service registrations.
   */
  verifyInstanceName(serviceName: string): boolean {
    return (Object.values(ServiceInstanceName) as readonly string[]).includes(serviceName);
  }
}
