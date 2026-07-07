import type { CircuitState } from "../domain/circuit-state";
import type { IUnkeyedCircuitBreaker } from "./circuit-breaker.interface";

export interface CircuitBreakerConfig {
	failureThreshold: number;
	cooldownMs: number;
	halfOpenMaxAttempts?: number;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
	failureThreshold: 5,
	cooldownMs: 30_000,
};

interface PersistentState {
	failures: number;
	openUntil: number;
	halfOpenAttempts: number;
}

export class CircuitStateMachine implements IUnkeyedCircuitBreaker {
	protected _failures = 0;
	protected _openUntil = 0;
	protected _halfOpenAttempts = 0;

	constructor(protected readonly _config: CircuitBreakerConfig) {}

	get failures(): number {
		return this._failures;
	}

	check(): CircuitState {
		return this.getState(Date.now());
	}

	isAllowed(): boolean {
		return !this.isOpen(Date.now());
	}

	getFailureCount(): number {
		return this._failures;
	}

	async call<TResult>(fn: () => Promise<TResult>, fallback?: () => TResult): Promise<TResult> {
		if (!this.isAllowed()) {
			if (fallback) return fallback();
			throw new Error("Circuit breaker OPEN");
		}
		try {
			const result = await fn();
			this.recordSuccess();
			return result;
		} catch (error) {
			this.recordFailure();
			if (fallback) return fallback();
			throw error;
		}
	}

	getState(now?: number): CircuitState {
		const effectiveNow = now ?? Date.now();
		if (this._openUntil > effectiveNow) {
			return "open";
		}
		if (this._openUntil > 0) {
			return "half-open";
		}
		return "closed";
	}

	isOpen(now?: number): boolean {
		const effectiveNow = now ?? Date.now();
		if (this._openUntil > effectiveNow) {
			return true;
		}
		if (this._openUntil > 0) {
			this._transitionToClosed();
		}
		return false;
	}

	recordFailure(count = 1, threshold?: number): boolean {
		const effectiveNow = Date.now();
		this._failures += count;
		if (this._openUntil > 0) {
			this._halfOpenAttempts++;
			if (
				this._config.halfOpenMaxAttempts !== undefined &&
				this._halfOpenAttempts >= this._config.halfOpenMaxAttempts
			) {
				this._openUntil = effectiveNow + this._config.cooldownMs;
				return true;
			}
			return false;
		}
		if (this._failures >= (threshold ?? this._config.failureThreshold)) {
			this._openUntil = effectiveNow + this._config.cooldownMs;
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

	clear(): void {
		this.reset();
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
