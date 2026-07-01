export type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerEntry {
  failures: number;
  state: CircuitState;
  lastFailureTime: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 30_000,
};

/**
 * Generic circuit breaker tracking success/failure for a keyed resource.
 * Each resource (e.g., hostname, service name) has its own entry.
 */
export class CircuitBreaker {
  private readonly entries = new Map<string, CircuitBreakerEntry>();
  private readonly config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private getEntry(key: string): CircuitBreakerEntry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { failures: 0, state: 'closed', lastFailureTime: 0 };
      this.entries.set(key, entry);
    }
    return entry;
  }

  /**
   * Checks whether the circuit allows a request.
   * @throws with a message if the circuit is open (caller should catch or handle).
   * @returns the current state (closed, half-open) when request is allowed.
   */
  check(key: string): CircuitState {
    const entry = this.getEntry(key);
    if (entry.state === 'open') {
      if (Date.now() - entry.lastFailureTime >= this.config.cooldownMs) {
        entry.state = 'half-open';
        return 'half-open';
      }
      // Circuit is open — caller should throw
      return 'open';
    }
    return entry.state;
  }

  recordSuccess(key: string): void {
    const entry = this.getEntry(key);
    entry.failures = 0;
    entry.state = 'closed';
  }

  recordFailure(key: string, count = 1): void {
    const entry = this.getEntry(key);
    entry.failures += count;
    entry.lastFailureTime = Date.now();
    if (entry.failures >= this.config.failureThreshold) {
      entry.state = 'open';
    }
  }
}
