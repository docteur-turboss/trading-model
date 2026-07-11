import type { ServiceInstanceName } from "../config/services.types";
import type { DurationMs, Region, Version } from "../domain/primitives";
import type { HostPort } from "../domain/service-identity";

export interface ResolvedEndpoint extends HostPort {
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
	): Promise<ResolvedEndpoint | null>;
	invalidateCache?(serviceName?: ServiceInstanceName): void;
}
