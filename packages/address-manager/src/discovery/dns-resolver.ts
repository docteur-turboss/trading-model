import type { ServiceId } from "@trading-model/common/domain/primitives";

/**
 * Strategy for resolving a logical service name to a DNS-resolvable hostname.
 *
 * Implementations can be deployment-specific:
 * - Docker Compose → maps logical names to Compose service names
 * - Kubernetes → uses K8s DNS (e.g. `<service>.<namespace>.svc.cluster.local`)
 * - Standalone → uses IP addresses or `/etc/hosts`
 */
export interface DnsResolver {
	/** Resolve a logical service name to a DNS hostname. */
	resolve(serviceName: ServiceId): string;
}

/**
 * Default resolver that returns the logical service name as-is.
 * Works when service names are already DNS-resolvable (e.g. Docker Compose).
 */
export class IdentityResolver implements DnsResolver {
	resolve(serviceName: ServiceId): string {
		return serviceName;
	}
}

/**
 * Resolver backed by a static mapping of logical names to DNS hostnames.
 * The map is typically loaded from environment configuration at startup.
 */
export class MapResolver implements DnsResolver {
	constructor(private readonly _dnsNameMap: Partial<Record<ServiceId, string>>) {}

	resolve(serviceName: ServiceId): string {
		return this._dnsNameMap[serviceName] ?? serviceName;
	}
}
