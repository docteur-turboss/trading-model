import type {
	DurationMs,
	Region,
	Version,
} from "@trading-model/primitives/primitives";
import type { HostPort } from "@trading-model/primitives/service-identity";

export interface ResolvedEndpoint extends HostPort {
	version?: Version;
}

export interface ResolveOptions {
	majorVersion?: number;
	region?: Region;
	timeoutMs?: DurationMs;
}
