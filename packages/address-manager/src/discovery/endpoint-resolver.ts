import {
	normalizeServiceName,
	registryNamesFor,
} from "@trading-model/common/utils/spiffe";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import { HttpClient } from "@trading-model/http/http-client";
import {
	type DurationMs,
	type ServiceId,
	URLString,
} from "@trading-model/primitives/primitives";
import { ServiceInstancesWire } from "@trading-model/validation/wire/service-instance";

const DISCOVERY_SERVICE = "discovery-server";

/**
 * Registry lookups of the address-manager clients (ADR-0045). The gateway no
 * longer asks the registry: it routes on the Service DNS name (ADR-0072).
 */
export class EndpointResolver {
	private readonly _discoveryUrl: string;
	private readonly _httpClient: HttpClient;

	constructor(
		discoveryUrl: string,
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

	/**
	 * First live registered instance of the service (of the wanted major
	 * version, any when omitted), asked under every registry alias. Used by
	 * `DiscoveryRetryHandler.lookup`. Throws when the registry cannot be
	 * reached; `undefined` means it answered and nothing matches. Routes use
	 * canonical names (`financial-scraper`) while services register legacy ones
	 * (`financial-scraper-service`): each alias is asked until one answers.
	 */
	async findInstance(
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
}
