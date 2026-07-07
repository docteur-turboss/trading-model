export interface FeatureFlagDefinition {
	name: string;
	defaultEnabled: boolean;
	description: string;
	owner: string;
}

export interface FeatureFlag {
	name: string;
	enabled: boolean;
	description: string;
	owner: string;
}

export const PLATFORM_FLAG_DEFINITIONS: FeatureFlagDefinition[] = [
	{
		name: "DLQ_AUTO_RETRY",
		defaultEnabled: true,
		description: "Automatically retry dead-lettered messages",
		owner: "@trading-model/messaging",
	},
	{
		name: "CANARY_MIGRATIONS",
		defaultEnabled: false,
		description: "Run database migrations in canary before full rollout",
		owner: "@trading-model/platform",
	},
	{
		name: "STRICT_CIRCUIT_BREAKER",
		defaultEnabled: true,
		description: "Enable strict circuit breaker with half-open recovery",
		owner: "@trading-model/platform",
	},
	{
		name: "MESSAGE_DEDUPLICATION",
		defaultEnabled: true,
		description: "Deduplicate messages at the broker level",
		owner: "@trading-model/messaging",
	},
	{
		name: "GRACEFUL_SHUTDOWN_DRAIN",
		defaultEnabled: true,
		description: "Drain active connections during graceful shutdown",
		owner: "@trading-model/platform",
	},
	{
		name: "ENABLE_REQUEST_LOGGING",
		defaultEnabled: true,
		description: "Log all incoming HTTP requests",
		owner: "@trading-model/platform",
	},
	{
		name: "ENABLE_METRICS_EXPORT",
		defaultEnabled: true,
		description: "Export Prometheus metrics",
		owner: "@trading-model/platform",
	},
	{
		name: "ENABLE_DETAILED_ERROR_RESPONSE",
		defaultEnabled: false,
		description: "Include error details in HTTP responses (dev only)",
		owner: "@trading-model/platform",
	},
	{
		name: "ENABLE_CACHE_BYPASS",
		defaultEnabled: false,
		description: "Bypass all caches for debugging",
		owner: "@trading-model/platform",
	},
	{
		name: "WAL_SYNCHRONOUS_FLUSH",
		defaultEnabled: false,
		description: "Flush WAL synchronously on every write",
		owner: "@trading-model/messaging",
	},
	{
		name: "ENABLE_TELEMETRY_DETAILED",
		defaultEnabled: true,
		description: "Enable detailed OpenTelemetry spans",
		owner: "@trading-model/platform",
	},
	{
		name: "ENFORCE_MTLS_STRICT",
		defaultEnabled: true,
		description: "Reject connections without valid mTLS certificates",
		owner: "@trading-model/platform",
	},
];
