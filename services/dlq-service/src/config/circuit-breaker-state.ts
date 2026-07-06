import type { CircuitState } from "@trading-model/common/domain/circuit-state";

export interface CircuitStateConfig {
	failureThreshold: number;
	resetMs: number;
	halfOpenMaxAttempts: number;
	name: string;
}

export class DlqCircuitBreakerState {
	private _failures = 0;
	private _openUntil = 0;
	private _halfOpenAttempts = 0;

	constructor(private readonly _config: CircuitStateConfig) {}

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
			this.reset();
		}
		return false;
	}

	recordFailure(now: number, onOpened: (name: string, failures: number, halfOpenAttempts: number, resetMs: number) => void): void {
		this._failures++;
		this._checkHalfOpenReopen(now, onOpened);
		this._checkThresholdOpen(now, onOpened);
	}

	recordSuccess(): void {
		if (this._failures > 0) {
			this._failures = 0;
		}
		this._openUntil = 0;
		this._halfOpenAttempts = 0;
	}

	reset(): void {
		this._failures = 0;
		this._openUntil = 0;
		this._halfOpenAttempts = 0;
	}

	private _checkHalfOpenReopen(now: number, onOpened: (name: string, failures: number, halfOpenAttempts: number, resetMs: number) => void): void {
		if (this._openUntil <= 0) {
			return;
		}
		this._halfOpenAttempts++;
		if (this._halfOpenAttempts >= this._config.halfOpenMaxAttempts) {
			this._openUntil = now + this._config.resetMs;
			onOpened(this._config.name, this._failures, this._halfOpenAttempts, this._config.resetMs);
		}
	}

	private _checkThresholdOpen(now: number, onOpened: (name: string, failures: number, halfOpenAttempts: number, resetMs: number) => void): void {
		if (this._failures < this._config.failureThreshold) {
			return;
		}
		this._openUntil = now + this._config.resetMs;
		onOpened(this._config.name, this._failures, this._halfOpenAttempts, this._config.resetMs);
	}
}
