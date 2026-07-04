import { logger } from "@trading-model/common/config/logger";

/**
 * Pure application orchestration for DLQ replay.
 * Coordinates batch replay with circuit breaking, concurrency control, and timeout handling.
 * No HTTP, no MongoDB, no Redis — receives pre-resolved dependencies.
 */
export class ReplayOrchestrator {
	private _circuitState: "closed" | "open" | "half-open" = "closed";
	private _circuitFailures = 0;
	private _circuitOpenUntil = 0;
	private _halfOpenAttempts = 0;
	private _activeBatches = 0;

	constructor(
		private readonly _circuitThreshold = 5,
		private readonly _circuitCooldownMs = 30_000,
		private readonly _halfOpenMaxAttempts = 2,
		private readonly _maxConcurrentBatches = 2
	) {}

	/** Check if the circuit allows a request. Returns false if OPEN. */
	canProceed(): boolean {
		if (this._circuitOpenUntil > Date.now()) {
			return false;
		}
		if (this._circuitOpenUntil > 0) {
			this._circuitFailures = 0;
			this._circuitOpenUntil = 0;
			this._halfOpenAttempts = 0;
		}
		return true;
	}

	/** Record the result of a batch replay. */
	recordResult(success: boolean): void {
		if (success) {
			if (this._circuitFailures > 0) {
				this._circuitFailures = 0;
			}
			this._circuitOpenUntil = 0;
			this._halfOpenAttempts = 0;
		} else {
			this._circuitFailures++;
			if (this._circuitOpenUntil > 0) {
				this._halfOpenAttempts++;
				if (this._halfOpenAttempts >= this._halfOpenMaxAttempts) {
					this._circuitOpenUntil = Date.now() + this._circuitCooldownMs;
					logger.warn("Replay circuit breaker re-opened during half-open", {
						failures: this._circuitFailures,
						halfOpenAttempts: this._halfOpenAttempts,
					});
				}
			}
			if (this._circuitFailures >= this._circuitThreshold) {
				this._circuitOpenUntil = Date.now() + this._circuitCooldownMs;
				logger.warn("Replay circuit breaker opened", {
					failures: this._circuitFailures,
					cooldownMs: this._circuitCooldownMs,
				});
			}
		}
	}

	/** Check if batch concurrency limit has been reached. */
	canStartBatch(): boolean {
		if (this._activeBatches >= this._maxConcurrentBatches) {
			logger.warn("Too many concurrent replay batches", {
				activeBatches: this._activeBatches,
				max: this._maxConcurrentBatches,
			});
			return false;
		}
		return true;
	}

	acquireBatch(): void {
		this._activeBatches++;
	}

	releaseBatch(): void {
		if (this._activeBatches > 0) {
			this._activeBatches--;
		}
	}

	getCircuitState(): string {
		return this._circuitState;
	}
}
