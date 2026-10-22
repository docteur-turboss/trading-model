import type { ServiceId } from "@trading-model/primitives/primitives";

export interface DnsResolver {
	resolve(serviceId: ServiceId): string;
}
