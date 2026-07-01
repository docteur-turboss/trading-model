export class TokenBucket {
  private capacity: number;
  private refillRate: number;
  private refillIntervalMs: number;
  private tokens: number;
  private lastRefill: number;
  private metricCallback: ((usage: number) => void) | null = null;

  constructor(capacity: number, refillRate: number, refillIntervalMs: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.refillIntervalMs = refillIntervalMs;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  onMetric(cb: (usage: number) => void): void {
    this.metricCallback = cb;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed < this.refillIntervalMs) return;

    const intervals = Math.floor(elapsed / this.refillIntervalMs);
    if (intervals > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + this.refillRate * intervals);
      this.lastRefill += intervals * this.refillIntervalMs;
    }
  }

  tryConsume(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      this.metricCallback?.(this.getUsage());
      return true;
    }
    return false;
  }

  getAvailable(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  getCapacity(): number {
    return this.capacity;
  }

  getUsage(): number {
    return 1 - this.getAvailable() / this.capacity;
  }
}
