import type { ICircuitBreaker } from "@trading-model/common/reliability/circuit-breaker.interface";
import type { CircuitStateConfig } from "./circuit-breaker-state";
import { DlqCircuitBreakerState } from "./circuit-breaker-state";
import { logger } from "./logger";

export class MessageManagerCircuitBreaker implements ICircuitBreaker {
	private readonly _state: DlqCircuitBreakerState;

	constructor(config?: Partial<CircuitStateConfig>) {
		this._state = new DlqCircuitBreakerState({
			failureThreshold: 5,
			resetMs: 30_000,
			halfOpenMaxAttempts: 2,
			name: "message-manager",
			...config,
		});
	}

	isOpen(_key?: string): boolean {
		return this._state.isOpen(Date.now());
	}

	isAllowed(_key?: string): boolean {
		return !this._state.isOpen(Date.now());
	}

	check(
		_key?: string
	): import("@trading-model/common/domain/circuit-state").CircuitState {
		const now = Date.now();
		const state = this._state.getState(now);
		if (state === "half-open") {
			this._state.reset();
		}
		return state;
	}

	recordSuccess(_key?: string): void {
		this._state.recordSuccess();
	}

	recordFailure(_key?: string): void {
		this._state.recordFailure(Date.now(), this._logOpened);
	}

	getState(
		_key?: string
	): import("@trading-model/common/domain/circuit-state").CircuitState {
		return this._state.getState(Date.now());
	}

	getFailureCount(_key?: string): number {
		return this._state.failures;
	}

	clear(): void {
		this._state.reset();
	}

	private readonly _logOpened = (
		name: string,
		failures: number,
		halfOpenAttempts: number,
		resetMs: number
	): void => {
		logger.warn(
			`${name} circuit breaker ${halfOpenAttempts > 0 ? "re-opened during half-open" : "opened"}`,
			{ failures, halfOpenAttempts, resetMs }
		);
	};
}
