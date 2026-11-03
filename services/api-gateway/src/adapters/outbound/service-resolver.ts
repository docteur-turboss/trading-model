import { lookup } from "node:dns/promises";
import {
	normalizeServiceName,
	registryNamesFor,
} from "@trading-model/common/utils/spiffe";
import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import {
	IPAddress,
	type ServiceId,
	UnixTimestamp,
	URLString,
	type Version,
} from "@trading-model/primitives/primitives";
import type { ResolvedEndpoint } from "@trading-model/validation/adapters/outbound/service-resolver.types";

const DISCOVERY_SERVICE = "discovery-server";

interface CachedService {
	instances: ResolvedEndpoint[];
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
	): Promise<ResolvedEndpoint | null> {
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
	): Promise<ResolvedEndpoint | null> {
		const instances = await this._fetchInstances(serviceName);
		if (!Array.isArray(instances)) {
			return this._handleFallback(cacheKey);
		}
		const matching = instances
			.filter(
				(inst) =>
					Number.parseInt(inst.version.split(".")[0], 10) === majorVersion
			)
			.map((inst) => ({
				host: IPAddress.of(inst.host),
				port: inst.port,
				version: inst.version as Version,
			}));
		const cachedService: CachedService = {
			instances: matching,
			expiresAt: UnixTimestamp.of(Date.now() + this._cacheTtlMs),
			nextIndex: 0,
		};
		this._cache.set(cacheKey, cachedService);
		return matching.length === 0 ? null : this._selectInstance(cachedService);
	}

	/**
	 * Instances registered under any name of the service: routes use canonical
	 * names (`financial-scraper`) while services register legacy ones
	 * (`financial-scraper-service`). Discovery does not register itself, so it
	 * is reached at its configured URL.
	 */
	private async _fetchInstances(
		serviceName: ServiceId
	): Promise<ServiceInstance[] | undefined> {
		if (String(normalizeServiceName(serviceName)) === DISCOVERY_SERVICE) {
			return [await this._discoveryInstance()];
		}
		let lastError: unknown;
		let answered = false;
		for (const name of registryNamesFor(serviceName)) {
			// biome-ignore lint/plugin: an unknown alias is expected, the next one is tried
			try {
				const response = await this._httpClient.get<{
					data: ServiceInstance[];
				}>(URLString.of(`${this._discoveryUrl}/services/${name}`));
				const instances = Array.isArray(response)
					? response
					: (response as { data: ServiceInstance[] }).data;
				if (!Array.isArray(instances)) {
					return;
				}
				answered = true;
				if (instances.length > 0) {
					return instances;
				}
			} catch (error) {
				lastError = error;
			}
		}
		if (!answered) {
			throw lastError;
		}
		return [];
	}

	private async _discoveryInstance(): Promise<ServiceInstance> {
		const url = new URL(this._discoveryUrl);
		// The proxy only targets IPs in ALLOWED_PROXY_CIDRS: resolve the hostname.
		const { address } = await lookup(url.hostname, { family: 4 });
		return {
			serviceName: DISCOVERY_SERVICE,
			host: address,
			port: Number(url.port || 443),
			version: "1.0.0",
		} as unknown as ServiceInstance;
	}

	private _handleFallback(cacheKey: string): ResolvedEndpoint | null {
		const stale = this._cache.get(cacheKey);
		return stale && stale.instances.length > 0
			? this._selectInstance(stale)
			: null;
	}
	private _selectInstance(cached: CachedService): ResolvedEndpoint {
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
