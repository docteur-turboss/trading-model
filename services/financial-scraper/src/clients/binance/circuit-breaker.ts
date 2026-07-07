import {
	type CircuitState,
	CircuitBreaker as SharedCB,
} from "@trading-model/common/reliability/circuit-breaker";
import type { ICircuitBreaker } from "@trading-model/common/reliability/circuit-breaker.interface";

interface BinanceCircuitBreakerConfig {
	failureThreshold: number;
	recoveryTimeoutMs: number;
	halfOpenMaxRequests: number;
}

/**
 * Tracks concurrent probe requests when the circuit is in half-open state.
 */
class HalfOpenProbeTracker {
	private _probes = 0;

	constructor(private readonly _maxRequests: number) {}

	tryProbe(): boolean {
		this._probes++;
		return this._probes <= this._maxRequests;
	}

	reset(): void {
		this._probes = 0;
	}
}

/**
 * High-level circuit breaker wrapping the shared CircuitBreaker.
 * Adds half-open probe limiting on top of the base call().
 */
export class BinanceCircuitBreaker implements ICircuitBreaker {
	private readonly _inner: SharedCB;
	private readonly _halfOpenTracker: HalfOpenProbeTracker;

	constructor(
		private readonly _name: string,
		config: BinanceCircuitBreakerConfig = {
			failureThreshold: 5,
			recoveryTimeoutMs: 30_000,
			halfOpenMaxRequests: 3,
		}
	) {
		this._inner = new SharedCB({
			failureThreshold: config.failureThreshold,
			cooldownMs: config.recoveryTimeoutMs,
		});
		this._halfOpenTracker = new HalfOpenProbeTracker(
			config.halfOpenMaxRequests
		);
	}

	check(_key: string): CircuitState {
		return this._inner.check(this._name);
	}

	isAllowed(_key: string): boolean {
		return this._inner.isAllowed(this._name);
	}

	recordSuccess(_key: string): void {
		this._inner.recordSuccess(this._name);
		this._halfOpenTracker.reset();
	}

	recordFailure(_key: string, _count?: number, _threshold?: number): void {
		this._inner.recordFailure(this._name);
		this._halfOpenTracker.reset();
	}

	isOpen(_key: string): boolean {
		return this._inner.isOpen(this._name);
	}

	getState(_key: string): CircuitState {
		return this._inner.getState(this._name);
	}

	getFailureCount(_key: string): number {
		return this._inner.getFailureCount(this._name);
	}

	clear(): void {
		this._halfOpenTracker.reset();
		this._inner.clear();
	}

	async call<TResult>(
		_key: string,
		fn: () => Promise<TResult>,
		fallback?: () => TResult,
	): Promise<TResult> {
		const state = this._inner.check(this._name);
		if (state === "half-open" && !this._halfOpenTracker.tryProbe()) {
			if (fallback) {
				return fallback();
			}
			throw new Error(`Circuit breaker OPEN: ${this._name}`);
		}
		return this._inner.call(this._name, fn, fallback);
	}
}

export const binanceCircuitBreaker = new BinanceCircuitBreaker("binance-api");
