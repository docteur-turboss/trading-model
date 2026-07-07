import { BaseCircuitBreaker } from "@trading-model/common/reliability/base-circuit-breaker";
import type { CircuitState } from "@trading-model/common/domain/circuit-state";
import type { CircuitStateConfig } from "./circuit-breaker-state";
import { DlqCircuitBreakerState } from "./circuit-breaker-state";
import { logger } from "./logger";

export class MessageManagerCircuitBreaker extends BaseCircuitBreaker {
	private readonly _state: DlqCircuitBreakerState;

	constructor(config?: Partial<CircuitStateConfig>) {
		super({
			failureThreshold: config?.failureThreshold ?? 5,
			cooldownMs: config?.resetMs ?? 30_000,
			halfOpenMaxAttempts: config?.halfOpenMaxAttempts,
		});
		this._state = new DlqCircuitBreakerState({
			failureThreshold: 5,
			resetMs: 30_000,
			halfOpenMaxAttempts: 2,
			name: "message-manager",
			...config,
		});
	}

	isOpen(_key: string): boolean {
		return this._state.isOpen(Date.now());
	}

	isAllowed(_key: string): boolean {
		return !this._state.isOpen(Date.now());
	}

	check(_key: string): CircuitState {
		return this._state.getState(Date.now());
	}

	recordSuccess(_key: string): void {
		this._state.recordSuccess();
	}

	recordFailure(_key: string, _count?: number, _threshold?: number): void {
		this._state.recordFailure(Date.now(), this._logOpened);
	}

	getState(_key: string): CircuitState {
		return this._state.getState(Date.now());
	}

	getFailureCount(_key: string): number {
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
