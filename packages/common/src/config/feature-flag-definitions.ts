export enum PlatformFlagName {
	DLQ_AUTO_RETRY = "DLQ_AUTO_RETRY",
	CANARY_MIGRATIONS = "CANARY_MIGRATIONS",
	STRICT_CIRCUIT_BREAKER = "STRICT_CIRCUIT_BREAKER",
	MESSAGE_DEDUPLICATION = "MESSAGE_DEDUPLICATION",
	GRACEFUL_SHUTDOWN_DRAIN = "GRACEFUL_SHUTDOWN_DRAIN",
	ENABLE_REQUEST_LOGGING = "ENABLE_REQUEST_LOGGING",
	ENABLE_METRICS_EXPORT = "ENABLE_METRICS_EXPORT",
	ENABLE_DETAILED_ERROR_RESPONSE = "ENABLE_DETAILED_ERROR_RESPONSE",
	ENABLE_CACHE_BYPASS = "ENABLE_CACHE_BYPASS",
	WAL_SYNCHRONOUS_FLUSH = "WAL_SYNCHRONOUS_FLUSH",
	ENABLE_TELEMETRY_DETAILED = "ENABLE_TELEMETRY_DETAILED",
	ENFORCE_MTLS_STRICT = "ENFORCE_MTLS_STRICT",
}

export interface FeatureFlagBase {
	name: PlatformFlagName;
	description: string;
	owner: string;
}

export interface FeatureFlagDefinition extends FeatureFlagBase {
	defaultEnabled: boolean;
}

export interface FeatureFlag extends FeatureFlagBase {
	enabled: boolean;
}

export const PLATFORM_FLAG_DEFINITIONS: FeatureFlagDefinition[] = [
	{
		name: PlatformFlagName.DLQ_AUTO_RETRY,
		defaultEnabled: true,
		description: "Automatically retry dead-lettered messages",
		owner: "@trading-model/messaging",
	},
	{
		name: PlatformFlagName.CANARY_MIGRATIONS,
		defaultEnabled: false,
		description: "Run database migrations in canary before full rollout",
		owner: "@trading-model/platform",
	},
	{
		name: PlatformFlagName.STRICT_CIRCUIT_BREAKER,
		defaultEnabled: true,
		description: "Enable strict circuit breaker with half-open recovery",
		owner: "@trading-model/platform",
	},
	{
		name: PlatformFlagName.MESSAGE_DEDUPLICATION,
		defaultEnabled: true,
		description: "Deduplicate messages at the broker level",
		owner: "@trading-model/messaging",
	},
	{
		name: PlatformFlagName.GRACEFUL_SHUTDOWN_DRAIN,
		defaultEnabled: true,
		description: "Drain active connections during graceful shutdown",
		owner: "@trading-model/platform",
	},
	{
		name: PlatformFlagName.ENABLE_REQUEST_LOGGING,
		defaultEnabled: true,
		description: "Log all incoming HTTP requests",
		owner: "@trading-model/platform",
	},
	{
		name: PlatformFlagName.ENABLE_METRICS_EXPORT,
		defaultEnabled: true,
		description: "Export Prometheus metrics",
		owner: "@trading-model/platform",
	},
	{
		name: PlatformFlagName.ENABLE_DETAILED_ERROR_RESPONSE,
		defaultEnabled: false,
		description: "Include error details in HTTP responses (dev only)",
		owner: "@trading-model/platform",
	},
	{
		name: PlatformFlagName.ENABLE_CACHE_BYPASS,
		defaultEnabled: false,
		description: "Bypass all caches for debugging",
		owner: "@trading-model/platform",
	},
	{
		name: PlatformFlagName.WAL_SYNCHRONOUS_FLUSH,
		defaultEnabled: false,
		description: "Flush WAL synchronously on every write",
		owner: "@trading-model/messaging",
	},
	{
		name: PlatformFlagName.ENABLE_TELEMETRY_DETAILED,
		defaultEnabled: true,
		description: "Enable detailed OpenTelemetry spans",
		owner: "@trading-model/platform",
	},
	{
		name: PlatformFlagName.ENFORCE_MTLS_STRICT,
		defaultEnabled: true,
		description: "Reject connections without valid mTLS certificates",
		owner: "@trading-model/platform",
	},
];
