import { lookup } from "node:dns/promises";
import {
	normalizeServiceName,
	registryNamesFor,
} from "@trading-model/common/utils/spiffe";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import {
	type DurationMs,
	IPAddress,
	type Port,
	type ServiceId,
	UnixTimestamp,
	URLString,
	type Version,
} from "@trading-model/primitives/primitives";
import { ServiceInstancesWire } from "@trading-model/validation/wire/service-instance";

const DISCOVERY_SERVICE = "discovery-server";

/** Where a call goes: an IP (so callers can check it against a CIDR allowlist). */
export interface ResolvedTarget {
	host: IPAddress;
	port: Port;
	version: Version;
}

interface CachedTarget {
	target: ResolvedTarget | null;
	expiresAt: UnixTimestamp;
}

/**
 * The one resolution strategy (ADR-0045): the registry says whether a major
 * version of the service is alive, the platform says where it is (DNS name of
 * the Service, resolved to an IP; kube-proxy / compose DNS spread the calls).
 * The registered instance IP is never used as the target.
 */
export class EndpointResolver {
	private readonly _cache = new Map<string, CachedTarget>();
	private readonly _inFlight = new Map<
		string,
		Promise<ResolvedTarget | null>
	>();
	private readonly _discoveryUrl: string;
	private readonly _httpClient: HttpClient;

	constructor(
		discoveryUrl: string,
		private readonly _cacheTtlMs: number,
		httpClient?: HttpClient,
		private readonly _timeoutMs?: DurationMs
	) {
		// A loop, not a /+$ regex: that one is polynomial on a long run of slashes (CodeQL).
		let url = discoveryUrl;
		while (url.endsWith("/")) {
			url = url.slice(0, -1);
		}
		this._discoveryUrl = url;
		this._httpClient = httpClient ?? new HttpClient();
	}

	resolve(
		serviceName: ServiceId,
		majorVersion?: number
	): Promise<ResolvedTarget | null> {
		const key = `${serviceName}:v${majorVersion}`;
		const cached = this._cache.get(key);
		if (cached && Date.now() < cached.expiresAt) {
			return Promise.resolve(cached.target);
		}
		// One lookup in flight per key: concurrent callers on an expired entry share it.
		const pending = this._inFlight.get(key);
		if (pending !== undefined) {
			return pending;
		}
		const lookup = this._refresh(
			key,
			serviceName,
			majorVersion,
			cached
		).finally(() => this._inFlight.delete(key));
		this._inFlight.set(key, lookup);
		return lookup;
	}

	private async _refresh(
		key: string,
		serviceName: ServiceId,
		majorVersion: number | undefined,
		cached: CachedTarget | undefined
	): Promise<ResolvedTarget | null> {
		let alive: ServiceInstance | undefined;
		try {
			alive = await this._aliveInstance(serviceName, majorVersion);
		} catch (error) {
			// Registry unreachable: the last known answer beats a 404 on a healthy service.
			getLogger().warn("Registry unreachable, serving last known target", {
				context: { serviceName, majorVersion, error: String(error) },
			});
			return cached?.target ?? null;
		}
		const target = alive ? await this._locate(serviceName, alive) : null;
		this._cache.set(key, {
			target,
			expiresAt: UnixTimestamp.of(Date.now() + this._cacheTtlMs),
		});
		return target;
	}

	private async _locate(
		serviceName: ServiceId,
		instance: ServiceInstance
	): Promise<ResolvedTarget> {
		const isDiscovery =
			String(normalizeServiceName(serviceName)) === DISCOVERY_SERVICE;
		// Discovery never registers: it is reached at its configured URL.
		const url = new URL(this._discoveryUrl);
		const dnsName = isDiscovery
			? url.hostname
			: String(normalizeServiceName(serviceName));
		const { address } = await lookup(dnsName, { family: 4 });
		return {
			host: IPAddress.of(address),
			port: (isDiscovery ? Number(url.port || 443) : instance.port) as Port,
			version: (isDiscovery ? "1.0.0" : instance.version) as Version,
		};
	}

	/**
	 * First live registered instance of the service (of the wanted major
	 * version, any when omitted), asked under every registry alias. The one
	 * selection path: `resolve` (gateway) and `ServiceResolver.findService`
	 * (address-manager) both go through it. Throws when the registry cannot be
	 * reached; `undefined` means it answered and nothing matches.
	 */
	findInstance(
		serviceName: ServiceId,
		majorVersion?: number
	): Promise<ServiceInstance | undefined> {
		return this._aliveInstance(serviceName, majorVersion);
	}

	/**
	 * Routes use canonical names (`financial-scraper`) while services register
	 * legacy ones (`financial-scraper-service`): each alias is asked until one
	 * answers.
	 */
	private async _aliveInstance(
		serviceName: ServiceId,
		majorVersion?: number
	): Promise<ServiceInstance | undefined> {
		if (String(normalizeServiceName(serviceName)) === DISCOVERY_SERVICE) {
			return { version: "1.0.0" } as ServiceInstance;
		}
		let lastError: unknown;
		let answered = false;
		for (const name of registryNamesFor(serviceName)) {
			// biome-ignore lint/plugin: an unknown alias is expected, the next one is tried
			try {
				const instances = await this._httpClient.get(
					URLString.of(`${this._discoveryUrl}/services/${name}`),
					this._timeoutMs ? { timeoutMs: this._timeoutMs } : undefined,
					ServiceInstancesWire
				);
				if (!Array.isArray(instances)) {
					getLogger().warn("Registry answered with a malformed body", {
						context: { serviceName, alias: name },
					});
					lastError = new Error(`Malformed registry answer for "${name}"`);
					continue;
				}
				answered = true;
				const match = instances.find(
					(inst) =>
						majorVersion === undefined ||
						Number.parseInt(inst.version.split(".")[0], 10) === majorVersion
				);
				if (match) {
					return match;
				}
			} catch (error) {
				lastError = error;
			}
		}
		if (!answered) {
			throw lastError;
		}
	}

	invalidateCache(serviceName?: string): void {
		if (!serviceName) {
			this._cache.clear();
			return;
		}
		for (const key of this._cache.keys()) {
			if (key.startsWith(serviceName)) {
				this._cache.delete(key);
			}
		}
	}
}
