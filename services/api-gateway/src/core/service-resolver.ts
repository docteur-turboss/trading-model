import { HttpClient } from "@trading-model/common/config/http-client";
import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { IPAddress, UnixTimestamp, Version } from "@trading-model/common/domain/primitives";
import type { ServiceEndpoint } from "@trading-model/common/contracts/service-resolver.types";

interface CachedService {
	instances: ServiceEndpoint[];
	expiresAt: UnixTimestamp;
	nextIndex: number;
}

export class ServiceResolver {
	private readonly _cache = new Map<string, CachedService>();
	private readonly _httpClient: HttpClient;
	private readonly _discoveryUrl: string;
	private readonly _cacheTtlMs: number;

	constructor(
		discoveryUrl: string,
		cacheTtlMs: number,
		httpClient?: HttpClient
	) {
		this._discoveryUrl = discoveryUrl.replace(/\/+$/, "");
		this._cacheTtlMs = cacheTtlMs;
		this._httpClient = httpClient ?? new HttpClient();
	}

	async resolve(
		serviceName: ServiceId,
		majorVersion: number
	): Promise<ServiceEndpoint | null> {
		const cacheKey = `${serviceName}:v${majorVersion}`;
		const cached = this._cache.get(cacheKey);
		if (cached && Date.now() < cached.expiresAt) {
			return cached.instances.length === 0
				? null
				: this._selectInstance(cached);
		}
		try {
			return await this._fetchAndCache(serviceName, majorVersion, cacheKey);
		} catch {
			return this._handleFallback(cacheKey);
		}
	}

	private async _fetchAndCache(
		serviceName: ServiceId,
		majorVersion: number,
		cacheKey: string
	): Promise<ServiceEndpoint | null> {
		const response = await this._httpClient.get<{ data: ServiceInstance[] }>(
			`${this._discoveryUrl}/services/${serviceName}`
		);
		const instances = Array.isArray(response)
			? response
			: (response as { data: ServiceInstance[] }).data;
		if (!Array.isArray(instances)) {
			return this._handleFallback(cacheKey);
		}
		const matching = instances
			.filter(
				(inst) =>
					Number.parseInt(inst.version.split(".")[0], 10) === majorVersion
			)
			.map((inst) => ({
				host: inst.ip as IPAddress,
				port: inst.port,
				version: inst.version as Version,
			}));
		const cachedService: CachedService = {
			instances: matching,
			expiresAt: (Date.now() + this._cacheTtlMs) as UnixTimestamp,
			nextIndex: 0,
		};
		this._cache.set(cacheKey, cachedService);
		return matching.length === 0 ? null : this._selectInstance(cachedService);
	}

	private _handleFallback(cacheKey: string): ServiceEndpoint | null {
		const stale = this._cache.get(cacheKey);
		return stale && stale.instances.length > 0
			? this._selectInstance(stale)
			: null;
	}
	private _selectInstance(cached: CachedService): ServiceEndpoint {
		const index = cached.nextIndex % cached.instances.length;
		cached.nextIndex = (cached.nextIndex + 1) % cached.instances.length;
		return cached.instances[index];
	}
	invalidateCache(serviceName?: string): void {
		if (serviceName) {
			for (const key of this._cache.keys()) {
				if (key.startsWith(serviceName)) {
					this._cache.delete(key);
				}
			}
		} else {
			this._cache.clear();
		}
	}
}
