export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
  timeoutMs: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly baseCooldownMs: number;
  private readonly effectiveCooldownMs: number;
  private readonly timeoutMs: number;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.baseCooldownMs = options.cooldownMs ?? 30_000;
    this.effectiveCooldownMs = this.baseCooldownMs + Math.random() * this.baseCooldownMs * 0.5;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  getState(): CircuitState {
    return this.state;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.effectiveCooldownMs * 0.7) {
        const proba = Math.min(1, (elapsed - this.effectiveCooldownMs * 0.7) / (this.effectiveCooldownMs * 0.3));
        if (Math.random() < proba) {
          this.state = 'half-open';
        }
      }
      if (this.state === 'open') {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await this.withTimeout(fn);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private async withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Request timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
    });
    try {
      return await Promise.race([fn(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === 'half-open' || this.failureCount >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
  }
}
