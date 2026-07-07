import type { CircuitState } from "../domain/circuit-state";
import type { CircuitBreakerConfig } from "./circuit-breaker";

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
	failureThreshold: 5,
	cooldownMs: 30_000,
};

interface PersistentState {
	failures: number;
	openUntil: number;
	halfOpenAttempts: number;
}

export class CircuitStateMachine {
	protected _failures = 0;
	protected _openUntil = 0;
	protected _halfOpenAttempts = 0;

	constructor(protected readonly _config: CircuitBreakerConfig) {}

	get failures(): number {
		return this._failures;
	}

	getState(now: number): CircuitState {
		if (this._openUntil > now) {
			return "open";
		}
		if (this._openUntil > 0) {
			return "half-open";
		}
		return "closed";
	}

	isOpen(now: number): boolean {
		if (this._openUntil > now) {
			return true;
		}
		if (this._openUntil > 0) {
			this._transitionToClosed();
		}
		return false;
	}

	recordFailure(now: number): boolean {
		this._failures++;
		if (this._openUntil > 0) {
			this._halfOpenAttempts++;
			if (
				this._config.halfOpenMaxAttempts !== undefined &&
				this._halfOpenAttempts >= this._config.halfOpenMaxAttempts
			) {
				this._openUntil = now + this._config.cooldownMs;
				return true;
			}
			return false;
		}
		if (this._failures >= this._config.failureThreshold) {
			this._openUntil = now + this._config.cooldownMs;
			return true;
		}
		return false;
	}

	recordSuccess(): void {
		this._failures = 0;
		this._openUntil = 0;
		this._halfOpenAttempts = 0;
	}

	reset(): void {
		this._failures = 0;
		this._openUntil = 0;
		this._halfOpenAttempts = 0;
	}

	protected _transitionToClosed(): void {
		this._openUntil = 0;
		this._halfOpenAttempts = 0;
	}

	/** Snapshot for persistence / inspection. */
	snapshot(): PersistentState {
		return {
			failures: this._failures,
			openUntil: this._openUntil,
			halfOpenAttempts: this._halfOpenAttempts,
		};
	}

	restore(state: PersistentState): void {
		this._failures = state.failures;
		this._openUntil = state.openUntil;
		this._halfOpenAttempts = state.halfOpenAttempts;
	}
}
