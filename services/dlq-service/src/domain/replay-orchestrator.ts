import { logger } from "@trading-model/common/config/logger";
import { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";

export interface ReplayOrchestratorConfig {
	maxConcurrentBatches?: number;
	failureThreshold?: number;
	resetMs?: number;
	halfOpenMaxAttempts?: number;
}

export class ReplayOrchestrator {
	private readonly _maxConcurrentBatches: number;
	private readonly _circuitBreaker: CircuitStateMachine;
	private _activeBatches = 0;

	constructor(config: ReplayOrchestratorConfig = {}) {
		this._maxConcurrentBatches = config.maxConcurrentBatches ?? 2;
		this._circuitBreaker = new CircuitStateMachine({
			failureThreshold: config.failureThreshold ?? 5,
			cooldownMs: config.resetMs ?? 30_000,
			halfOpenMaxAttempts: config.halfOpenMaxAttempts,
			onOpen: (state) => {
				logger.warn(
					`replay circuit breaker ${state.previousState === "half-open" ? "re-opened during half-open" : "opened"}`,
					{
						failures: state.failures,
						halfOpenAttempts: state.halfOpenAttempts,
					}
				);
			},
		});
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
