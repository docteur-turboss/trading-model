import type { CircuitState } from "@trading-model/common/domain/circuit-state";
import { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";

export interface CircuitStateConfig {
	failureThreshold: number;
	resetMs: number;
	halfOpenMaxAttempts: number;
	name: string;
}

/**
 * A component of CircuitBreaker — manages failure count, open/half-open timing,
 * and threshold checks for a single circuit (no key-based isolation).
 *
 * @remarks This class is intentionally kept as a component rather than
 * implementing ICircuitBreaker because its methods operate with timestamps
 * (`now: number`) rather than string keys. It is owned by
 * MessageManagerCircuitBreaker which provides the ICircuitBreaker contract.
 *
 * @see MessageManagerCircuitBreaker
 */
export class DlqCircuitBreakerState {
	private readonly _machine: CircuitStateMachine;
	private readonly _name: string;
	private readonly _resetMs: number;

	constructor(config: CircuitStateConfig) {
		this._machine = new CircuitStateMachine({
			failureThreshold: config.failureThreshold,
			cooldownMs: config.resetMs,
			halfOpenMaxAttempts: config.halfOpenMaxAttempts,
		});
		this._name = config.name;
		this._resetMs = config.resetMs;
	}

	get failures(): number {
		return this._machine.failures;
	}

	getState(now: number): CircuitState {
		return this._machine.getState(now);
	}

	isOpen(now: number): boolean {
		return this._machine.isOpen(now);
	}

	recordFailure(
		now: number,
		onOpened: (
			name: string,
			failures: number,
			halfOpenAttempts: number,
			resetMs: number
		) => void
	): void {
		const opened = this._machine.recordFailure(now);
		if (opened) {
			const snapshot = this._machine.snapshot();
			onOpened(
				this._name,
				snapshot.failures,
				snapshot.halfOpenAttempts,
				this._resetMs
			);
		}
	}

	recordSuccess(): void {
		this._machine.recordSuccess();
	}

	reset(): void {
		this._machine.reset();
	}
}
