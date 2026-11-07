import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import type {
	DurationMs,
	IPAddress,
	Port,
	ServiceId,
} from "@trading-model/primitives/primitives";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";

/** Configuration options for the Address Manager client. */
interface AddressManagerConfig {
	identity: ServiceIdentity;
	servicePort: Port;
	/** Discovery URL (a Service / load balancer in front of every replica). */
	addressManagerUrl: string;

	tls: TlsPaths;
	tokenRefreshIntervalMs: DurationMs;
	ttlRefreshIntervalMs: DurationMs;
	servicePingTimeoutMs: DurationMs;
	discoveryTimeoutMs: DurationMs;

	cacheTtlMs: DurationMs;
	dnsNameMap?: Record<ServiceId, IPAddress>;
}

export type { AddressManagerConfig };
