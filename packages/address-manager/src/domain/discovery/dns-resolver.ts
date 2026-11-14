import type { ServiceId } from "@trading-model/primitives/primitives";

/** Resolves a service id to its host name. */
export interface DnsResolver {
	resolve(serviceId: ServiceId): string;
}
