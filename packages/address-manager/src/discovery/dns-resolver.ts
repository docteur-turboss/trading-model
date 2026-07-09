export interface DnsResolver {
	resolve(serviceId: string): string;
}

export { MapResolver } from "./service-locator";
