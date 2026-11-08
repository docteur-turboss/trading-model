import type {
	DurationMs,
	Environment,
	Region,
	UnixTimestamp,
	Version,
} from "@trading-model/primitives/primitives";
import type {
	HostPort,
	ServiceIdentity,
} from "@trading-model/primitives/service-identity";

export enum Protocol {
	Http = "http",
	Https = "https",
	Mtls = "mtls",
}

/** A registered service instance with its connection metadata and health state. */
export interface ServiceInstance extends ServiceIdentity, HostPort {
	lastHeartbeat: UnixTimestamp;
	registeredAt: UnixTimestamp;
	protocol: Protocol;
	env?: Environment;
	ttl: DurationMs;
	version: Version;
	/** Deployment region / datacenter for multi-region failover. */
	region?: Region;
}
