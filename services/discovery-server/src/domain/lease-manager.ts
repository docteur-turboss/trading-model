import { DurationMs } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import type { ServiceInstance } from "../shared/types";
import { isAliveInstance } from "./expiration";
import { type LoggerPort, NoopLogger } from "./logger-port";
import type { ServiceRegistry } from "./service-registry";
import { StaleInstanceCleaner } from "./stale-instance-cleaner";

export interface LeaseManagerOptions {
	cleanupIntervalMs?: number;
	logger?: LoggerPort;
}

export class LeaseManager {
	private _cleanupIntervalMs: number;
	private readonly _intervalHandle = new TimerHandle();
	private readonly _logger: LoggerPort;

	constructor(
		readonly _registry: ServiceRegistry,
		options?: LeaseManagerOptions
	) {
		this._cleanupIntervalMs = options?.cleanupIntervalMs ?? 5000;
		this._logger = options?.logger ?? NoopLogger;
	}

	start(): void {
		if (this._intervalHandle.isRunning) {
			return;
		}
		this._intervalHandle.startInterval(() => {
			try {
				StaleInstanceCleaner.cleanupSync({
					listServiceNames: () =>
						this._registry.instanceStore.listServiceNames(),
					getInstances: (name) =>
						this._registry.instanceStore.getInstances(name),
					removeInstance: (id) => {
						try {
							this._registry.removeInstance(id);
						} catch (err) {
							this._logger.error("Failed to remove expired instance", {
								serviceName: id.serviceName,
								instanceId: id.instanceId,
								error: normalizeError(err),
							});
						}
					},
				});
			} catch (err) {
				this._logger.error("Cleanup error", { error: normalizeError(err) });
			}
		}, DurationMs.of(this._cleanupIntervalMs));
		this._logger.info("Cleanup loop started", {
			cleanupIntervalMs: this._cleanupIntervalMs,
		});
	}

	stop(): void {
		this._intervalHandle.stop();
		this._logger.info("Cleanup loop stopped");
	}

	isAlive(instance: ServiceInstance): boolean {
		return isAliveInstance(instance);
	}
}
