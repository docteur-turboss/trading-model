import { logger } from "@trading-model/common/config/logger";
import type { FallbackManager } from "./fallback-manager";
import type { HealthStateManager } from "./health-state-manager";
import type { HealthCheckCallbacks } from "./redis-health-monitor";

export class FallbackRestoreHandler {
	constructor(
		private readonly _healthState: HealthStateManager,
		private readonly _fallbackManager: FallbackManager,
		private readonly _callbacks: HealthCheckCallbacks
	) {}

	async performRestoreCheck(): Promise<void> {
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
}
