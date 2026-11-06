import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import {
	type LoggerPort,
	NoopLogger,
} from "@trading-model/contracts/logger-registry";
import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import type { DurationMs } from "@trading-model/primitives/primitives";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/primitives/primitives";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import { isExpiredInstance } from "./expiration";
import {
	type CleanupMetricsPort,
	NoopDiscoveryMetrics,
} from "./ports/discovery-metrics.port";

export interface CleanupDeps {
	listServiceNames(): Promise<ServiceInstanceName[]>;
	getInstances(serviceName: ServiceInstanceName): Promise<ServiceInstance[]>;
	removeInstance(id: ServiceIdentity): Promise<boolean>;
	/** Runs at the end of every cycle, once expired instances are gone. */
	afterCleanup?(): Promise<void>;
	logger?: LoggerPort;
	metrics?: CleanupMetricsPort;
}

export class StaleInstanceCleaner {
	private readonly _handle = new TimerHandle();
	/** Random jitter before the first cycle; cancelled by stop(). */
	private _startDelay: ReturnType<typeof setTimeout> | null = null;
	private readonly _logger: LoggerPort;
	private readonly _metrics: CleanupMetricsPort;

	constructor(
		private readonly _deps: CleanupDeps,
		private readonly _intervalMs: DurationMs
	) {
		this._logger = _deps.logger ?? NoopLogger;
		this._metrics = _deps.metrics ?? NoopDiscoveryMetrics;
	}

	start(): void {
		this._clearStartDelay();
		const initialDelay = Math.floor(Math.random() * this._intervalMs);
		this._startDelay = setTimeout(() => {
			this._startDelay = null;
			this._handle.startInterval(() => {
				this._cleanup().catch((err) => {
					this._logger.error("Redis cleanup error", {
						error: normalizeError(err),
					});
					this._metrics.incOperationError("cleanup");
				});
			}, this._intervalMs);
		}, initialDelay);
		this._startDelay.unref();
	}

	stop(): void {
		this._clearStartDelay();
		this._handle.stop();
	}

	private _clearStartDelay(): void {
		if (this._startDelay !== null) {
			clearTimeout(this._startDelay);
			this._startDelay = null;
		}
	}

	async cleanupNow(): Promise<void> {
		await this._cleanup();
	}

	private async _removeExpiredInstance(
		serviceName: ServiceInstanceName,
		instance: ServiceInstance,
		now: number
	): Promise<void> {
		this._logger.warn("Expired instance removed", {
			serviceName,
			instanceId: instance.instanceId,
			heartbeatAge: now - instance.lastHeartbeat,
			ttl: instance.ttl,
		});
		await this._deps.removeInstance({
			serviceName: toServiceId(serviceName),
			instanceId: toInstanceId(instance.instanceId),
		});
	}

	private async _cleanup(): Promise<void> {
		this._metrics.incLeaseCleanupCycle();
		const start = performance.now();
		try {
			const now = Date.now();
			const serviceNames = await this._deps.listServiceNames();
			for (const serviceName of serviceNames) {
				const instances = await this._deps.getInstances(serviceName);
				for (const instance of instances) {
					if (isExpiredInstance(instance, now)) {
						await this._removeExpiredInstance(serviceName, instance, now);
					}
				}
			}
			await this._deps.afterCleanup?.();
		} finally {
			this._metrics.observeCleanupDuration(performance.now() - start);
		}
	}
}
