import { logger } from "@trading-model/common/config/logger";
import type { RegistryBackend } from "@trading-model/common/contracts/service-registry.types";

export interface HealthCheckCallbacks {
	ping: () => Promise<boolean>;
	onHealthLost: () => void;
	onHealthRestored: () => void;
	onFallbackActivated: (fallback: RegistryBackend) => void;
	onFallbackRestored: (original: RegistryBackend) => void;
}

export class RedisHealthMonitor {
	private _healthy = true;
	private _consecutiveFailures = 0;
	private _healthCheckRunning = false;
	private _healthCheckHandle?: NodeJS.Timeout;
	private _restoreHandle?: NodeJS.Timeout;
	private _fallbackActive = false;
	private _originalBackend?: RegistryBackend;
	private _backend: RegistryBackend;

	constructor(
		private readonly _failureThreshold: number,
		private readonly _healthCheckIntervalMs: number,
		private readonly _shouldRun: () => boolean,
		private readonly _callbacks: HealthCheckCallbacks,
		backend: RegistryBackend
	) {
		this._backend = backend;
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
		if (!this._fallbackActive) {
			this._originalBackend = this._backend;
		}
		this._fallbackActive = true;
		this._backend = fallback;
		this._callbacks.onFallbackActivated(fallback);
	}

	stopBackend(): void {
		if (this._originalBackend) {
			try {
				this._originalBackend.stop();
			} catch {
				/* ignore */
			}
			this._originalBackend = undefined;
		}
		this._backend.stop();
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

	private async _performHealthCheck(): Promise<void> {
		if (this._healthCheckRunning) {
			return;
		}
		this._healthCheckRunning = true;
		try {
			const healthy = await this._callbacks.ping();
			if (healthy) {
				if (!this._healthy) {
					this._healthy = true;
					this._callbacks.onHealthRestored();
					logger.info(
						"Redis backend is healthy again — resumed normal operation"
					);
				}
				this._consecutiveFailures = 0;
			} else {
				this._consecutiveFailures++;
				if (this._consecutiveFailures >= this._failureThreshold) {
					this._healthy = false;
					this._callbacks.onHealthLost();
					logger.error("Redis backend unhealthy — serving stale cache", {
						consecutiveFailures: this._consecutiveFailures,
					});
				}
			}
		} catch {
			this._consecutiveFailures++;
			if (this._consecutiveFailures >= this._failureThreshold) {
				this._healthy = false;
				this._callbacks.onHealthLost();
				logger.error("Redis backend unhealthy — serving stale cache", {
					consecutiveFailures: this._consecutiveFailures,
				});
			}
		} finally {
			this._healthCheckRunning = false;
		}
	}

	private async _performRestoreCheck(): Promise<void> {
		if (this._healthy) {
			return;
		}
		try {
			const healthy = await this._callbacks.ping();
			if (healthy) {
				if (this._fallbackActive && this._originalBackend) {
					this._backend = this._originalBackend;
					this._originalBackend = undefined;
					this._fallbackActive = false;
					this._callbacks.onFallbackRestored(this._backend);
					logger.info("Restored original Redis backend");
				}
				this._healthy = true;
				this._consecutiveFailures = 0;
				this._callbacks.onHealthRestored();
				logger.info(
					"Redis backend is healthy again — resumed normal operation"
				);
			}
		} catch {
			logger.warn("Redis restore attempt failed — staying on stale cache");
		}
	}
}
