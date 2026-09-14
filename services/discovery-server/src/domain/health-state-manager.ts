import type { LoggerPort } from "./logger-port";
import { NoopLogger } from "./logger-port";

export class HealthStateManager {
	private _healthy = true;
	private _consecutiveFailures = 0;
	private readonly _logger: LoggerPort;

	constructor(
		private readonly _failureThreshold: number,
		logger: LoggerPort = NoopLogger
	) {
		this._logger = logger;
	}

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
			this._logger.info(
				"Redis backend is healthy again — resumed normal operation"
			);
		}
		this._consecutiveFailures = 0;
	}

	handleHealthFailure(onLost?: () => void): void {
		this._consecutiveFailures++;
		if (this._consecutiveFailures >= this._failureThreshold) {
			this._healthy = false;
			onLost?.();
			this._logger.error("Redis backend unhealthy — serving stale cache", {
				consecutiveFailures: this._consecutiveFailures,
			});
		}
	}
}
