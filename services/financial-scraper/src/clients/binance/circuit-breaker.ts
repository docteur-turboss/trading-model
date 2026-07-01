import { logger } from '@trading-model/common/config/logger';
import {
  CircuitState,
  CircuitBreaker as SharedCB,
} from '@trading-model/common/reliability/circuit-breaker';

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
  private readonly inner: SharedCB;
  private halfOpenProbes = 0;

  constructor(
    private readonly name: string,
    private readonly config: BinanceCircuitBreakerConfig = {
      failureThreshold: 5,
      recoveryTimeoutMs: 30_000,
      halfOpenMaxRequests: 3,
    }
  ) {
    this.inner = new SharedCB({
      failureThreshold: config.failureThreshold,
      cooldownMs: config.recoveryTimeoutMs,
    });
  }

  async call<T>(fn: () => Promise<T>, fallback?: () => T): Promise<T> {
    const state = this.inner.check(this.name);

    if (state === 'open') {
      if (fallback) return fallback();
      throw new Error(`Circuit breaker OPEN: ${this.name}`);
    }

    if (state === 'half-open') {
      this.halfOpenProbes++;
      if (this.halfOpenProbes > this.config.halfOpenMaxRequests) {
        if (fallback) return fallback();
        throw new Error(`Circuit breaker OPEN: ${this.name}`);
      }
    }

    try {
      const result = await fn();
      this.inner.recordSuccess(this.name);
      this.halfOpenProbes = 0;
      return result;
    } catch (error) {
      this.inner.recordFailure(this.name);
      logger.warn(`Circuit breaker recorded failure: ${this.name}`);
      if (fallback) return fallback();
      throw error;
    }
  }

  getState(): CircuitState {
    return this.inner.check(this.name);
  }
}

export const binanceCircuitBreaker = new BinanceCircuitBreaker('binance-api');
