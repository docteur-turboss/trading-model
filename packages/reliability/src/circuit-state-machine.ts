import { CircuitState } from "@trading-model/primitives/circuit-state";
import {
	DurationMs,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

/** Thresholds of a circuit: failures before opening, cooldown while open (then one half-open probe). */
export interface CircuitBreakerConfig {
	failureThreshold: number;
	cooldownMs: DurationMs;
}

/** Default circuit config: opens after 5 failures, 30 s cooldown, one half-open probe. */
export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
	failureThreshold: 5,
	cooldownMs: DurationMs.of(30_000),
};

/** Closed / open / half-open state of one target; holds no timers, state is derived from the clock on each call. */
export class CircuitStateMachine {
	protected _failures = 0;
	protected _openUntil: UnixTimestamp = 0 as UnixTimestamp;
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
		}
		return false;
	}

	/** A failure during the half-open probe reopens the circuit; otherwise it opens at the threshold. */
	recordFailure(): boolean {
		const effectiveNow = UnixTimestamp.now();
		this._probeUntil = 0 as UnixTimestamp;
		this._failures++;
		if (
			this._openUntil > 0 ||
			this._failures >= this._config.failureThreshold
		) {
			this._openUntil = UnixTimestamp.add(
				effectiveNow,
				this._config.cooldownMs
			);
			return true;
		}
		return false;
	}

	recordSuccess(): void {
		this._probeUntil = 0 as UnixTimestamp;
		this._failures = 0;
		this._openUntil = 0 as UnixTimestamp;
	}
}
