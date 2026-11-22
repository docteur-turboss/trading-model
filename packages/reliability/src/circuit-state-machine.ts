import { CircuitState } from "@trading-model/primitives/circuit-state";
import {
	DurationMs,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

/** Thresholds of a circuit: failures before opening, cooldown while open, probes allowed half-open. */
export interface CircuitBreakerConfig {
	failureThreshold: number;
	cooldownMs: DurationMs;
	halfOpenMaxAttempts?: number;
}

/** Default circuit config: opens after 5 failures, 30 s cooldown, one half-open probe. */
export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
	failureThreshold: 5,
	cooldownMs: DurationMs.of(30_000),
	halfOpenMaxAttempts: 1,
};

/** Closed / open / half-open state of one target; holds no timers, state is derived from the clock on each call. */
export class CircuitStateMachine {
	protected _failures = 0;
	protected _openUntil: UnixTimestamp = 0 as UnixTimestamp;
	protected _halfOpenAttempts = 0;
	/** While in the future, the half-open probe is in flight: other callers see OPEN. */
	protected _probeUntil: UnixTimestamp = 0 as UnixTimestamp;

	constructor(protected readonly _config: CircuitBreakerConfig) {}

	static defaultConfig(): CircuitBreakerConfig {
		return { ...DEFAULT_CIRCUIT_CONFIG };
	}

	/** Half-open lets one caller through (the probe); the others see OPEN until its result or the cooldown. */
	check(): CircuitState {
		const now = UnixTimestamp.now();
		const state = this.getState(now);
		if (state !== CircuitState.HALF_OPEN) {
			return state;
		}
		if (this._probeUntil > now) {
			return CircuitState.OPEN;
		}
		this._probeUntil = UnixTimestamp.add(now, this._config.cooldownMs);
		return state;
	}

	getFailureCount(): number {
		return this._failures;
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
			this._openUntil = 0 as UnixTimestamp;
			this._halfOpenAttempts = 0;
		}
		return false;
	}

	recordFailure(count = 1, threshold?: number): boolean {
		const effectiveNow = UnixTimestamp.now();
		this._probeUntil = 0 as UnixTimestamp;
		this._failures += count;
		if (this._openUntil > 0) {
			return this._recordHalfOpenFailure(effectiveNow);
		}
		return this._recordClosedFailure(effectiveNow, threshold);
	}

	private _openCircuit(effectiveNow: UnixTimestamp): void {
		this._openUntil = UnixTimestamp.add(effectiveNow, this._config.cooldownMs);
	}

	private _recordHalfOpenFailure(effectiveNow: UnixTimestamp): boolean {
		this._halfOpenAttempts++;
		if (
			this._config.halfOpenMaxAttempts !== undefined &&
			this._halfOpenAttempts >= this._config.halfOpenMaxAttempts
		) {
			this._openCircuit(effectiveNow);
			return true;
		}
		return false;
	}

	private _recordClosedFailure(
		effectiveNow: UnixTimestamp,
		threshold: number | undefined
	): boolean {
		if (this._failures < (threshold ?? this._config.failureThreshold)) {
			return false;
		}
		this._openCircuit(effectiveNow);
		return true;
	}

	recordSuccess(): void {
		this._probeUntil = 0 as UnixTimestamp;
		this._failures = 0;
		this._openUntil = 0 as UnixTimestamp;
		this._halfOpenAttempts = 0;
	}

	clear(): void {
		this.recordSuccess();
	}
}
