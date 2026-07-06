import { logger } from "@trading-model/common/config/logger";

export class HealthStateManager {
	private _healthy = true;
	private _consecutiveFailures = 0;

	constructor(private readonly _failureThreshold: number) {}

	get isHealthy(): boolean {
		return this._healthy;
	}

	get consecutiveFailures(): number {
		return this._consecutiveFailures;
	}

	markUnhealthy(): void {
		this._healthy = false;
		this._consecutiveFailures = this._failureThreshold;
	}

	handleHealthSuccess(onRestored?: () => void): void {
		if (!this._healthy) {
			this._healthy = true;
			onRestored?.();
			logger.info("Redis backend is healthy again — resumed normal operation");
		}
		this._consecutiveFailures = 0;
	}

	handleHealthFailure(onLost?: () => void): void {
		this._consecutiveFailures++;
		if (this._consecutiveFailures >= this._failureThreshold) {
			this._healthy = false;
			onLost?.();
			logger.error("Redis backend unhealthy — serving stale cache", {
				consecutiveFailures: this._consecutiveFailures,
			});
		}
	}
}
