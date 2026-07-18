import { CircuitState } from "../domain/circuit-state";
import { DurationMs, UnixTimestamp } from "../domain/primitives";
import type { IUnkeyedCircuitBreaker } from "./circuit-breaker.interface";

export interface CircuitBreakerConfig {
	failureThreshold: number;
	cooldownMs: DurationMs;
	halfOpenMaxAttempts?: number;
	onOpen?: (state: {
		failures: number;
		halfOpenAttempts: number;
		previousState: CircuitState;
	}) => void;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
	failureThreshold: 5,
	cooldownMs: DurationMs.of(30_000),
};

interface PersistentState {
	failures: number;
	openUntil: number;
	halfOpenAttempts: number;
}

export class CircuitStateMachine implements IUnkeyedCircuitBreaker {
	protected _failures = 0;
	protected _openUntil: UnixTimestamp = 0 as UnixTimestamp;
	protected _halfOpenAttempts = 0;

	constructor(protected readonly _config: CircuitBreakerConfig) {}

	static defaultConfig(): CircuitBreakerConfig {
		return {
			failureThreshold: 5,
			cooldownMs: DurationMs.of(30_000),
		};
	}

	get failures(): number {
		return this._failures;
	}

	check(): CircuitState {
		return this.getState(UnixTimestamp.now());
	}

	isAllowed(): boolean {
		return !this.isOpen(UnixTimestamp.now());
	}

	getFailureCount(): number {
		return this._failures;
	}

	async call<TResult>(
		fn: () => Promise<TResult>,
		fallback?: () => TResult
	): Promise<TResult> {
		if (!this.isAllowed()) {
			if (fallback) {
				return fallback();
			}
			throw new Error("Circuit breaker OPEN");
		}
		try {
			const result = await fn();
			this.recordSuccess();
			return result;
		} catch (error) {
			this.recordFailure();
			if (fallback) {
				return fallback();
			}
			throw error;
		}
	}

	getState(now?: number): CircuitState {
		const effectiveNow = now ?? UnixTimestamp.now();
		if (this._openUntil > effectiveNow) {
			return CircuitState.OPEN;
		}
		if (this._openUntil > 0) {
			return CircuitState.HALF_OPEN;
		}
		return CircuitState.CLOSED;
	}

	isOpen(now?: number): boolean {
		const effectiveNow = now ?? UnixTimestamp.now();
		if (this._openUntil > effectiveNow) {
			return true;
		}
		if (this._openUntil > 0) {
			this._transitionToClosed();
		}
		return false;
	}

	recordFailure(count = 1, threshold?: number): boolean {
		const effectiveNow = UnixTimestamp.now();
		const prevState = this.getState(effectiveNow);
		this._failures += count;
		if (this._openUntil > 0) {
			this._halfOpenAttempts++;
			if (
				this._config.halfOpenMaxAttempts !== undefined &&
				this._halfOpenAttempts >= this._config.halfOpenMaxAttempts
			) {
				this._openUntil = UnixTimestamp.add(
					effectiveNow,
					this._config.cooldownMs
				);
				this._config.onOpen?.({
					failures: this._failures,
					halfOpenAttempts: this._halfOpenAttempts,
					previousState: prevState,
				});
				return true;
			}
			return false;
		}
		if (this._failures >= (threshold ?? this._config.failureThreshold)) {
			this._openUntil = UnixTimestamp.add(
				effectiveNow,
				this._config.cooldownMs
			);
			this._config.onOpen?.({
				failures: this._failures,
				halfOpenAttempts: this._halfOpenAttempts,
				previousState: prevState,
			});
			return true;
		}
		return false;
	}

	recordSuccess(): void {
		this._failures = 0;
		this._openUntil = 0 as UnixTimestamp;
		this._halfOpenAttempts = 0;
	}

	clear(): void {
		this._failures = 0;
		this._openUntil = 0 as UnixTimestamp;
		this._halfOpenAttempts = 0;
	}

	protected _transitionToClosed(): void {
		this._openUntil = 0 as UnixTimestamp;
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
		this._openUntil = state.openUntil as UnixTimestamp;
		this._halfOpenAttempts = state.halfOpenAttempts;
	}
}
