/**
 * Metrics emitted by the discovery domain (registry gauges, lease cleanup).
 *
 * Keeps domain logic free of prom-client: the concrete recorder is injected
 * from the composition root (config/container.ts).
 */
export interface RegistryMetricsPort {
	setRegisteredInstances(count: number): void;
	setRegisteredInstancesPerService(service: string, count: number): void;
}

export interface CleanupMetricsPort {
	incLeaseCleanupCycle(): void;
	observeCleanupDuration(durationMs: number): void;
	incOperationError(operation: string): void;
}

export type DiscoveryMetricsPort = RegistryMetricsPort & CleanupMetricsPort;

/** No-op recorder used as default when the composition root provides none. */
export const NoopDiscoveryMetrics: DiscoveryMetricsPort = {
	setRegisteredInstances: () => {
		// Intentional no-op.
	},
	setRegisteredInstancesPerService: () => {
		// Intentional no-op.
	},
	incLeaseCleanupCycle: () => {
		// Intentional no-op.
	},
	observeCleanupDuration: () => {
		// Intentional no-op.
	},
	incOperationError: () => {
		// Intentional no-op.
	},
};
