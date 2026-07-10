import type { ServiceInstanceName } from "../config/services.types";
import type { DurationMs, IPAddress, Port, Region, Version } from "../domain/primitives";

export interface ServiceEndpoint {
	host: IPAddress;
	port: Port;
	version?: Version;
}

export interface ResolveOptions {
	majorVersion?: number;
	region?: Region;
	timeoutMs?: DurationMs;
}

export interface IServiceResolver {
	resolve(
		serviceName: ServiceInstanceName,
		options?: ResolveOptions
	): Promise<ServiceEndpoint | null>;
	invalidateCache?(serviceName?: ServiceInstanceName): void;
}
