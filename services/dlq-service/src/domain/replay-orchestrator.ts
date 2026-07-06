import { logger } from "@trading-model/common/config/logger";
import {
	ReplayCircuitBreaker,
	type ReplayCircuitBreakerConfig,
} from "./replay-circuit-breaker";

/**
 * Pure application orchestration for DLQ replay.
 * Coordinates batch replay with concurrency control, delegating circuit breaking.
 * No HTTP, no MongoDB, no Redis — receives pre-resolved dependencies.
 */
export interface ReplayOrchestratorConfig extends ReplayCircuitBreakerConfig {
	maxConcurrentBatches?: number;
}

export class ReplayOrchestrator {
	private readonly _maxConcurrentBatches: number;
	private readonly _circuitBreaker: ReplayCircuitBreaker;
	private _activeBatches = 0;

	constructor(config: ReplayOrchestratorConfig = {}) {
		this._maxConcurrentBatches = config.maxConcurrentBatches ?? 2;
		this._circuitBreaker = new ReplayCircuitBreaker(config);
	}

	/** Check if the circuit allows a request. Returns false if OPEN. */
	canProceed(): boolean {
		return this._circuitBreaker.isAllowed();
	}

	recordSuccess(): void {
		this._circuitBreaker.recordSuccess();
	}

	recordFailure(): void {
		this._circuitBreaker.recordFailure();
	}

	/** Check if batch concurrency limit has been reached. */
	canStartBatch(): boolean {
		if (this._activeBatches >= this._maxConcurrentBatches) {
			logger.warn("Too many concurrent replay batches", {
				context: {
					activeBatches: this._activeBatches,
					max: this._maxConcurrentBatches,
				},
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

	getCircuitState(): import("@trading-model/common/domain/circuit-state").CircuitState {
		return this._circuitBreaker.getState();
	}
}
