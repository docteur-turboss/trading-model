import { logger } from "@trading-model/common/config/logger";
import { DurationMs } from "@trading-model/common/domain/primitives";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import type { RegistryBackend } from "@trading-model/validation/adapters/outbound/service-registry.types";
import type { HealthCheckCallbacks } from "./redis-health-monitor";

export class FallbackManager {
	private _fallbackActive = false;
	private _currentBackend: RegistryBackend;
	private readonly _primaryBackend: RegistryBackend;
	private readonly _callbacks: HealthCheckCallbacks;
	private readonly _restoreHandle = new TimerHandle();

	constructor(
		backend: RegistryBackend,
		private readonly _restoreIntervalMs: number,
		callbacks: HealthCheckCallbacks
	) {
		this._primaryBackend = backend;
		this._currentBackend = backend;
		this._callbacks = callbacks;
	}

	get fallbackActive(): boolean {
		return this._fallbackActive;
	}

	get currentBackend(): RegistryBackend {
		return this._currentBackend;
	}

	setFallbackBackend(fallback: RegistryBackend): void {
		logger.warn(
			"FallbackManager.setFallbackBackend — swapping to fallback backend"
		);
		this._fallbackActive = true;
		this._currentBackend = fallback;
		this._callbacks.onFallbackActivated(fallback);
	}

	stopBackend(): void {
		this._primaryBackend.stop();
		this._currentBackend.stop();
	}

	startRestoreLoop(restoreFn: () => Promise<void>): void {
		this._restoreHandle.startInterval(
			() => restoreFn(),
			DurationMs.of(this._restoreIntervalMs)
		);
	}

	clearRestoreTimer(): void {
		this._restoreHandle.stop();
	}

	restoreOriginalBackend(): void {
		if (!this._fallbackActive) {
			return;
		}
		this._currentBackend = this._primaryBackend;
		this._fallbackActive = false;
		this._callbacks.onFallbackRestored(this._currentBackend);
		logger.info("Restored original Redis backend");
	}
}
