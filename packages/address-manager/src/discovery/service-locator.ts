import type { ServiceInstance } from "../client/type";
import type { DnsResolver } from "./dns-resolver";

/**
 * Strategy for determining the target hostname to reach a service instance.
 *
 * Separating location from health checking allows each concern to vary
 * independently — the locator resolves WHERE to connect, the health
 * checker validates IF the service is alive.
 *
 * Implementations:
 * - `ServiceNameLocator` — uses the logical service name (DNS-resolvable envs)
 * - `IpAddressLocator` — uses the registered IP (direct connectivity)
 * - `MappingServiceLocator` — delegates to a DnsResolver for name mapping
 */
export interface ServiceLocator {
	/** Resolve the hostname for a service instance. */
	locate(instance: ServiceInstance): string;
}

/**
 * Resolves using the instance's logical service name.
 *
 * Suitable for environments where service names are DNS-resolvable
 * (Docker Compose, Kubernetes with DNS).
 */
export class ServiceNameLocator implements ServiceLocator {
	locate(instance: ServiceInstance): string {
		return instance.serviceName;
	}
}

/**
 * Resolves using the instance's registered IP address.
 *
 * Suitable for direct IP-based connectivity or environments
 * without DNS-based service discovery.
 */
export class IpAddressLocator implements ServiceLocator {
	locate(instance: ServiceInstance): string {
		return instance.ip;
	}
}

/**
 * Resolves using a DnsResolver strategy with a fallback to the
 * logical service name when the resolver has no mapping.
 */
export class MappingServiceLocator implements ServiceLocator {
	constructor(private readonly _dnsResolver: DnsResolver) {}

	locate(instance: ServiceInstance): string {
		return this._dnsResolver.resolve(instance.serviceName);
	}
}
