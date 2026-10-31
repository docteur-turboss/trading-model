import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import type { RedisConnectionConfig } from "@trading-model/persistence/redis-connection-manager";
import type {
	DurationMs,
	IPAddress,
	Port,
	PositiveInt,
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

	/**
	 * Redis shared by the replicas for resolved addresses and circuit state
	 * (`REDIS_SENTINELS` / `REDIS_URL`); unset: an in-memory cache per process.
	 */
	redisCache?: RedisConnectionConfig;

	circuitBreakerFailureThreshold?: PositiveInt;
	circuitBreakerHalfOpenTimeoutMs?: DurationMs;
	circuitBreakerCacheTtlMs?: DurationMs;
	circuitBreakerLatencyWindowSize?: PositiveInt;
	circuitBreakerLatencyThresholdMs?: DurationMs;
}

export type { AddressManagerConfig };
