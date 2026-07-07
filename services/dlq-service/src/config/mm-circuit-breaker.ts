import type { CircuitState } from "@trading-model/common/domain/circuit-state";
import type { IUnkeyedCircuitBreaker } from "@trading-model/common/reliability/circuit-breaker.interface";
import type { CircuitStateConfig } from "./circuit-breaker-state";
import { DlqCircuitBreakerState } from "./circuit-breaker-state";
import { logger } from "./logger";

export class MessageManagerCircuitBreaker implements IUnkeyedCircuitBreaker {
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

	isOpen(): boolean {
		return this._state.isOpen(Date.now());
	}

	isAllowed(): boolean {
		return !this._state.isOpen(Date.now());
	}

	check(): CircuitState {
		return this._state.getState(Date.now());
	}

	recordSuccess(): void {
		this._state.recordSuccess();
	}

	recordFailure(_count?: number, _threshold?: number): void {
		this._state.recordFailure(Date.now(), this._logOpened);
	}

	getState(): CircuitState {
		return this._state.getState(Date.now());
	}

	getFailureCount(): number {
		return this._state.failures;
	}

	clear(): void {
		this._state.reset();
	}

	async call<TResult>(
		fn: () => Promise<TResult>,
		fallback?: () => TResult,
	): Promise<TResult> {
		if (!this.isAllowed()) {
			if (fallback) return fallback();
			throw new Error("Circuit breaker is OPEN");
		}
		try {
			const result = await fn();
			this.recordSuccess();
			return result;
		} catch (error) {
			this.recordFailure();
			throw error;
		}
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
