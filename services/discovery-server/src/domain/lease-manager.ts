import { logger } from "@trading-model/common/config/logger";
import { DurationMs } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import type { ServiceInstance } from "../shared/types";
import { isAliveInstance } from "./expiration";
import type { ServiceRegistry } from "./service-registry";
import { StaleInstanceCleaner } from "./stale-instance-cleaner";

export class LeaseManager {
	private _cleanupIntervalMs: number;
	private readonly _intervalHandle = new TimerHandle();

	constructor(
		readonly _registry: ServiceRegistry,
		options?: { cleanupIntervalMs?: number }
	) {
		this._cleanupIntervalMs = options?.cleanupIntervalMs ?? 5000;
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
							logger.error("Failed to remove expired instance", {
								serviceName: id.serviceName,
								instanceId: id.instanceId,
								error: normalizeError(err),
							});
						}
					},
				});
			} catch (err) {
				logger.error("Cleanup error", { error: normalizeError(err) });
			}
		}, DurationMs.of(this._cleanupIntervalMs));
		logger.info("Cleanup loop started", {
			cleanupIntervalMs: this._cleanupIntervalMs,
		});
	}

	stop(): void {
		this._intervalHandle.stop();
		logger.info("Cleanup loop stopped");
	}

	isAlive(instance: ServiceInstance): boolean {
		return isAliveInstance(instance);
	}
}
