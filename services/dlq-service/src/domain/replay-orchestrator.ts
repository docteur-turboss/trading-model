import { logger } from "@trading-model/common/config/logger";

/**
 * Pure application orchestration for DLQ replay.
 * Coordinates batch replay with circuit breaking, concurrency control, and timeout handling.
 * No HTTP, no MongoDB, no Redis — receives pre-resolved dependencies.
 */
export interface ReplayOrchestratorConfig {
	circuitThreshold?: number;
	circuitCooldownMs?: number;
	halfOpenMaxAttempts?: number;
	maxConcurrentBatches?: number;
}

export class ReplayOrchestrator {
	private readonly _circuitThreshold: number;
	private readonly _circuitCooldownMs: number;
	private readonly _halfOpenMaxAttempts: number;
	private readonly _maxConcurrentBatches: number;
	private _circuitState: "closed" | "open" | "half-open" = "closed";
	private _circuitFailures = 0;
	private _circuitOpenUntil = 0;
	private _halfOpenAttempts = 0;
	private _activeBatches = 0;

	constructor(config: ReplayOrchestratorConfig = {}) {
		const {
			circuitThreshold = 5,
			circuitCooldownMs = 30_000,
			halfOpenMaxAttempts = 2,
			maxConcurrentBatches = 2,
		} = config;
		this._circuitThreshold = circuitThreshold;
		this._circuitCooldownMs = circuitCooldownMs;
		this._halfOpenMaxAttempts = halfOpenMaxAttempts;
		this._maxConcurrentBatches = maxConcurrentBatches;
	}

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
