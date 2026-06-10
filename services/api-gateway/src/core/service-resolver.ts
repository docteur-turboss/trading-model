import { HttpClient } from '@trading-model/common/config/http-client';
import { ServiceInstance } from '@trading-model/common/contracts/service-registry.types';

export interface ResolvedTarget {
  host: string;
  port: number;
  version: string;
}

interface CachedService {
  instances: ResolvedTarget[];
  expiresAt: number;
}

export class ServiceResolver {
  private readonly cache = new Map<string, CachedService>();

  private readonly httpClient: HttpClient;

  private readonly discoveryUrl: string;

  private readonly cacheTtlMs: number;

  private roundRobinIndex = 0;

  constructor(discoveryUrl: string, cacheTtlMs: number, httpClient?: HttpClient) {
    this.discoveryUrl = discoveryUrl.replace(/\/+$/, '');
    this.cacheTtlMs = cacheTtlMs;
    this.httpClient = httpClient ?? new HttpClient();
  }

  async resolve(serviceName: string, majorVersion: number): Promise<ResolvedTarget | null> {
    const cacheKey = `${serviceName}:v${majorVersion}`;

    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      if (cached.instances.length === 0) return null;
      return this.selectInstance(cached.instances);
    }

    try {
      const response = await this.httpClient.get<{ data: ServiceInstance[] }>(
        `${this.discoveryUrl}/services/${serviceName}`,
      );

      const instances = Array.isArray(response) ? response : (response as { data: ServiceInstance[] }).data;

      if (!Array.isArray(instances)) {
        return this.handleFallback(cacheKey);
      }

      const matching = instances
        .filter(inst => {
          const major = parseInt(inst.version.split('.')[0], 10);
          return major === majorVersion;
        })
        .map(inst => ({
          host: inst.ip,
          port: inst.port,
          version: inst.version,
        }));

      this.cache.set(cacheKey, {
        instances: matching,
        expiresAt: Date.now() + this.cacheTtlMs,
      });

      if (matching.length === 0) return null;
      return this.selectInstance(matching);
    } catch {
      return this.handleFallback(cacheKey);
    }
  }

  private handleFallback(cacheKey: string): ResolvedTarget | null {
    const stale = this.cache.get(cacheKey);
    if (stale && stale.instances.length > 0) {
      return this.selectInstance(stale.instances);
    }
    return null;
  }

  private selectInstance(instances: ResolvedTarget[]): ResolvedTarget {
    const index = this.roundRobinIndex % instances.length;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % instances.length;
    return instances[index];
  }

  invalidateCache(serviceName?: string): void {
    if (serviceName) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(serviceName)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
}
