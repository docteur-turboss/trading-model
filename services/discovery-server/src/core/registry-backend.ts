import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

import { logger } from '@trading-model/common/config/logger';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';
import { RegistryBackend, ServiceInstance } from '@trading-model/common/contracts/service-registry.types';
import { generateRandomStr } from '@trading-model/common/crypto/random';
import { normalizeError } from '@trading-model/common/utils/errors';

/**
 * InMemoryRegistryBackend
 *
 * Ephemeral, single-node storage for service instances.
 * Data is lost on restart – suitable for development and
 * single-instance deployments.
 *
 * Replaced by RedisRegistryBackend in multi-node / multi-region
 * production deployments.
 */
export class InMemoryRegistryBackend implements RegistryBackend {
  private readonly signingSecret: string;
  private services: Map<string, Map<string, ServiceInstance>> = new Map();
  private token: Map<string, string> = new Map();

  constructor(signingSecret?: string) {
    this.signingSecret = signingSecret ?? randomBytes(32).toString('hex');
  }

  async registerInstance(instance: ServiceInstance): Promise<string> {
    const { serviceName, instanceId } = instance;

    let instances = this.services.get(serviceName);
    if (!instances) {
      instances = new Map();
      this.services.set(serviceName, instances);
    }
    const token = this.generateInstanceToken(instanceId);

    const existing = instances.get(instanceId);
    if (existing) {
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

    this.token.set(instanceId, token);
    return token;
  }

  async updateHeartbeat(serviceName: string, instanceId: string): Promise<number | false> {
    const service = this.services.get(serviceName);
    if (!service) return false;

    const instance = service.get(instanceId);
    if (!instance) return false;

    instance.lastHeartbeat = Date.now();
    service.set(instanceId, instance);
    return instance.ttl;
  }

  async updateToken(instanceId: string): Promise<string> {
    const newToken = this.generateInstanceToken(instanceId);
    this.token.set(instanceId, newToken);
    return newToken;
  }

  async getInstances(serviceName: string): Promise<ServiceInstance[]> {
    const service = this.services.get(serviceName);
    if (!service) return [];
    return [...service.values()];
  }

  async getInstance(serviceName: string, instanceId: string): Promise<ServiceInstance | undefined> {
    return this.services.get(serviceName)?.get(instanceId);
  }

  async removeInstance(serviceName: string, instanceId: string): Promise<boolean> {
    const service = this.services.get(serviceName);
    if (!service) return false;

    const deleted = service.delete(instanceId);

    if (service.size === 0) {
      this.services.delete(serviceName);
    }

    this.token.delete(instanceId);
    return deleted;
  }

  async listServiceNames(): Promise<string[]> {
    return [...this.services.keys()];
  }

  async dump(): Promise<Record<string, ServiceInstance[]>> {
    const snapshot: Record<string, ServiceInstance[]> = {};
    for (const [serviceName, instances] of this.services.entries()) {
      snapshot[serviceName] = [...instances.values()];
    }
    return snapshot;
  }

  generateInstanceToken(instanceId: string): string {
    const encodedId = Buffer.from(instanceId, 'utf8').toString('base64url');
    const timestamp = Buffer.from(`${Date.now()}`, 'utf8').toString('base64url');
    const nonce = generateRandomStr();

    const hmac = createHmac('sha256', this.signingSecret)
      .update(`${encodedId}.${timestamp}.${nonce}`)
      .digest('base64url');

    return `${encodedId}.${timestamp}.${nonce}.${hmac}`;
  }

  generateInstanceId(serviceName: string, address: string, port: number): string {
    return createHmac('sha256', generateRandomStr())
      .update(`${serviceName}-${address}:${port}-${Date.now()}`)
      .digest('base64');
  }

  async validInstanceToken(token: string, instanceId: string): Promise<boolean> {
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
    } catch (err) {
      logger.warn('Token validation failed', { instanceId, err: normalizeError(err) });
      return false;
    }

    const storedToken = this.token.get(instanceId);
    return storedToken === token;
  }

  verifyInstanceName(serviceName: string): boolean {
    return (Object.values(ServiceInstanceName) as readonly string[]).includes(serviceName);
  }

  start(): void {
    // no-op for in-memory backend
  }

  stop(): void {
    // no-op for in-memory backend
  }
}
