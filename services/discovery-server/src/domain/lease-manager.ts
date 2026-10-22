import { DurationMs } from "@trading-model/primitives/primitives";
import type { ServiceInstance } from "../shared/types";
import { isAliveInstance } from "./expiration";
import { type LoggerPort, NoopLogger } from "./logger-port";
import type { CleanupMetricsPort } from "./ports/discovery-metrics.port";
import type { ServiceRegistry } from "./service-registry";
import { StaleInstanceCleaner } from "./stale-instance-cleaner";

export interface LeaseManagerOptions {
	cleanupIntervalMs?: number;
	logger?: LoggerPort;
	metrics?: CleanupMetricsPort;
}

export class LeaseManager {
	private readonly _cleaner: StaleInstanceCleaner;
	private readonly _logger: LoggerPort;
	private _started = false;

	constructor(registry: ServiceRegistry, options?: LeaseManagerOptions) {
		this._logger = options?.logger ?? NoopLogger;
		this._cleaner = new StaleInstanceCleaner(
			{
				listServiceNames: async () => registry.instanceStore.listServiceNames(),
				getInstances: async (name) => registry.instanceStore.getInstances(name),
				removeInstance: async (id) => registry.removeInstance(id),
				logger: this._logger,
				metrics: options?.metrics,
			},
			DurationMs.of(options?.cleanupIntervalMs ?? 5000)
		);
	}

	start(): void {
		if (this._started) {
			return;
		}
		this._started = true;
		this._cleaner.start();
		this._logger.info("Cleanup loop started");
	}

	stop(): void {
		this._cleaner.stop();
		this._started = false;
		this._logger.info("Cleanup loop stopped");
	}

	isAlive(instance: ServiceInstance): boolean {
		return isAliveInstance(instance);
	}
}
