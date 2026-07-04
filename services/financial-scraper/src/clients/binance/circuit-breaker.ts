import { logger } from "@trading-model/common/config/logger";
import {
	type CircuitState,
	CircuitBreaker as SharedCB,
} from "@trading-model/common/reliability/circuit-breaker";

interface BinanceCircuitBreakerConfig {
	failureThreshold: number;
	recoveryTimeoutMs: number;
	halfOpenMaxRequests: number;
}

/**
 * High-level circuit breaker wrapping the shared CircuitBreaker.
 * Adds async call() with automatic fallback and half-open probing.
 */
export class BinanceCircuitBreaker {
	private readonly _inner: SharedCB;
	private _halfOpenProbes = 0;

	constructor(
		private readonly _name: string,
		private readonly _config: BinanceCircuitBreakerConfig = {
			failureThreshold: 5,
			recoveryTimeoutMs: 30_000,
			halfOpenMaxRequests: 3,
		}
	) {
		this._inner = new SharedCB({
			failureThreshold: _config.failureThreshold,
			cooldownMs: _config.recoveryTimeoutMs,
		});
	}

	async call<TValue>(
		fn: () => Promise<TValue>,
		fallback?: () => TValue
	): Promise<TValue> {
		const state = this._inner.check(this._name);

		if (state === "open") {
			if (fallback) {
				return fallback();
			}
			throw new Error(`Circuit breaker OPEN: ${this._name}`);
		}

		if (state === "half-open") {
			this._halfOpenProbes++;
			if (this._halfOpenProbes > this._config.halfOpenMaxRequests) {
				if (fallback) {
					return fallback();
				}
				throw new Error(`Circuit breaker OPEN: ${this._name}`);
			}
		}

		try {
			const result = await fn();
			this._inner.recordSuccess(this._name);
			this._halfOpenProbes = 0;
			return result;
		} catch (error) {
			this._inner.recordFailure(this._name);
			logger.warn(`Circuit breaker recorded failure: ${this._name}`);
			if (fallback) {
				return fallback();
			}
			throw error;
		}
	}

	getState(): CircuitState {
		return this._inner.check(this._name);
	}
}

export const binanceCircuitBreaker = new BinanceCircuitBreaker("binance-api");
