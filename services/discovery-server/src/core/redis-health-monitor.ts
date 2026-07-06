import { logger } from "@trading-model/common/config/logger";
import type { RegistryBackend } from "@trading-model/common/contracts/service-registry.types";

export interface HealthCheckCallbacks {
	ping: () => Promise<boolean>;
	onHealthLost: () => void;
	onHealthRestored: () => void;
	onFallbackActivated: (fallback: RegistryBackend) => void;
	onFallbackRestored: (original: RegistryBackend) => void;
}

export interface RedisHealthMonitorConfig {
	failureThreshold: number;
	healthCheckIntervalMs: number;
	shouldRun: () => boolean;
	callbacks: HealthCheckCallbacks;
	backend: RegistryBackend;
}

export class RedisHealthMonitor {
	private _healthy = true;
	private _consecutiveFailures = 0;
	private _healthCheckRunning = false;
	private _healthCheckHandle?: NodeJS.Timeout;
	private _restoreHandle?: NodeJS.Timeout;
	private _fallbackActive = false;
	private _currentBackend: RegistryBackend;
	private readonly _primaryBackend: RegistryBackend;
	private readonly _failureThreshold: number;
	private readonly _healthCheckIntervalMs: number;
	private readonly _shouldRun: () => boolean;
	private readonly _callbacks: HealthCheckCallbacks;

	constructor(config: RedisHealthMonitorConfig) {
		this._failureThreshold = config.failureThreshold;
		this._healthCheckIntervalMs = config.healthCheckIntervalMs;
		this._shouldRun = config.shouldRun;
		this._callbacks = config.callbacks;
		this._primaryBackend = config.backend;
		this._currentBackend = config.backend;
	}

	get isHealthy(): boolean {
		return this._healthy;
	}

	get consecutiveFailures(): number {
		return this._consecutiveFailures;
	}

	get fallbackActive(): boolean {
		return this._fallbackActive;
	}

	start(): void {
		if (!this._shouldRun()) {
			return;
		}
		this._clearTimers();
		this._startHealthCheck();
		this._startRestoreLoop();
	}

	stop(): void {
		this._clearTimers();
	}

	markUnhealthy(): void {
		this._healthy = false;
		this._consecutiveFailures = this._failureThreshold;
	}

	setFallbackBackend(fallback: RegistryBackend): void {
		logger.warn(
			"RedisHealthMonitor.setFallbackBackend — swapping to fallback backend"
		);
		this._fallbackActive = true;
		this._currentBackend = fallback;
		this._callbacks.onFallbackActivated(fallback);
	}

	stopBackend(): void {
		this._primaryBackend.stop();
		this._currentBackend.stop();
	}

	private _clearTimers(): void {
		if (this._healthCheckHandle) {
			clearInterval(this._healthCheckHandle);
			this._healthCheckHandle = undefined;
		}
		if (this._restoreHandle) {
			clearInterval(this._restoreHandle);
			this._restoreHandle = undefined;
		}
	}

	private _startHealthCheck(): void {
		this._healthCheckHandle = setInterval(
			() => this._performHealthCheck(),
			this._healthCheckIntervalMs
		);
	}

	private _startRestoreLoop(): void {
		this._restoreHandle = setInterval(
			() => this._performRestoreCheck(),
			this._healthCheckIntervalMs * 6
		);
	}

	private _handleHealthSuccess(): void {
		if (!this._healthy) {
			this._healthy = true;
			this._callbacks.onHealthRestored();
			logger.info("Redis backend is healthy again — resumed normal operation");
		}
		this._consecutiveFailures = 0;
	}

	private _handleHealthFailure(): void {
		this._consecutiveFailures++;
		if (this._consecutiveFailures >= this._failureThreshold) {
			this._healthy = false;
			this._callbacks.onHealthLost();
			logger.error("Redis backend unhealthy — serving stale cache", {
				consecutiveFailures: this._consecutiveFailures,
			});
		}
	}

	private async _performHealthCheck(): Promise<void> {
		if (this._healthCheckRunning) return;
		this._healthCheckRunning = true;
		try {
			const healthy = await this._callbacks.ping();
			if (healthy) {
				this._handleHealthSuccess();
			} else {
				this._handleHealthFailure();
			}
		} catch {
			this._handleHealthFailure();
		} finally {
			this._healthCheckRunning = false;
		}
	}

	private _restoreOriginalBackend(): void {
		if (!this._fallbackActive) return;
		this._currentBackend = this._primaryBackend;
		this._fallbackActive = false;
		this._callbacks.onFallbackRestored(this._currentBackend);
		logger.info("Restored original Redis backend");
	}

	private _handleRestoreSuccess(): void {
		this._restoreOriginalBackend();
		this._healthy = true;
		this._consecutiveFailures = 0;
		this._callbacks.onHealthRestored();
		logger.info("Redis backend is healthy again — resumed normal operation");
	}

	private async _performRestoreCheck(): Promise<void> {
		if (this._healthy) return;
		try {
			if (await this._callbacks.ping()) {
				this._handleRestoreSuccess();
			}
		} catch {
			logger.warn("Redis restore attempt failed — staying on stale cache");
		}
	}
}
