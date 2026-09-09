import type { ServiceId } from "@trading-model/common/domain/primitives";

export interface DnsResolver {
	resolve(serviceId: ServiceId): string;
}

export { MapResolver } from "../../application/discovery/service-locator";
