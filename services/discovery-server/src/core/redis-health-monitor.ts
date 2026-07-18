import { logger } from "@trading-model/common/config/logger";
import type { DurationMs } from "@trading-model/common/domain/primitives";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import type { RegistryBackend } from "@trading-model/validation/contracts/service-registry.types";
import { FallbackManager } from "./fallback-manager";
import { HealthStateManager } from "./health-state-manager";

export interface HealthCheckCallbacks {
	ping: () => Promise<boolean>;
	onHealthLost: () => void;
	onHealthRestored: () => void;
	onFallbackActivated: (fallback: RegistryBackend) => void;
	onFallbackRestored: (original: RegistryBackend) => void;
}
export interface RedisHealthMonitorConfig {
	failureThreshold: number;
	healthCheckIntervalMs: DurationMs;
	shouldRun: () => boolean;
	callbacks: HealthCheckCallbacks;
	backend: RegistryBackend;
}

export class RedisHealthMonitor {
	private readonly _healthCheckHandle = new TimerHandle();
	private readonly _healthState: HealthStateManager;
	private readonly _healthCheckIntervalMs: DurationMs;
	private readonly _shouldRun: () => boolean;
	private readonly _callbacks: HealthCheckCallbacks;
	private readonly _fallbackManager: FallbackManager;

	constructor(config: RedisHealthMonitorConfig) {
		this._healthState = new HealthStateManager(config.failureThreshold);
		this._healthCheckIntervalMs = config.healthCheckIntervalMs;
		this._shouldRun = config.shouldRun;
		this._callbacks = config.callbacks;
		this._fallbackManager = new FallbackManager(
			config.backend,
			config.healthCheckIntervalMs * 6,
			config.callbacks
		);
	}
	get isHealthy(): boolean {
		return this._healthState.isHealthy;
	}
	get consecutiveFailures(): number {
		return this._healthState.consecutiveFailures;
	}
	get fallbackActive(): boolean {
		return this._fallbackManager.fallbackActive;
	}

	private async _performRestoreCheck(): Promise<void> {
		if (this._healthState.isHealthy) {
			return;
		}
		try {
			if (await this._callbacks.ping()) {
				this._handleRestoreSuccess();
			}
		} catch {
			logger.warn("Redis restore attempt failed — staying on stale cache");
		}
	}

	private _handleRestoreSuccess(): void {
		this._fallbackManager.restoreOriginalBackend();
		this._healthState.handleHealthSuccess(() =>
			this._callbacks.onHealthRestored()
		);
	}

	start(): void {
		if (!this._shouldRun()) {
			return;
		}
		this._clearTimers();
		let healthCheckRunning = false;
		this._healthCheckHandle.startInterval(async () => {
			if (healthCheckRunning) {
				return;
			}
			healthCheckRunning = true;
			try {
				const healthy = await this._callbacks.ping();
				if (healthy) {
					this._healthState.handleHealthSuccess(() =>
						this._callbacks.onHealthRestored()
					);
				} else {
					this._healthState.handleHealthFailure(() =>
						this._callbacks.onHealthLost()
					);
				}
			} catch {
				this._healthState.handleHealthFailure(() =>
					this._callbacks.onHealthLost()
				);
			} finally {
				healthCheckRunning = false;
			}
		}, this._healthCheckIntervalMs);
		this._fallbackManager.startRestoreLoop(() => this._performRestoreCheck());
	}
	stop(): void {
		this._clearTimers();
	}
	markUnhealthy(): void {
		this._healthState.markUnhealthy();
	}
	setFallbackBackend(fallback: RegistryBackend): void {
		this._fallbackManager.setFallbackBackend(fallback);
	}
	stopBackend(): void {
		this._fallbackManager.stopBackend();
	}
	private _clearTimers(): void {
		this._healthCheckHandle.stop();
		this._fallbackManager.clearRestoreTimer();
	}
}
