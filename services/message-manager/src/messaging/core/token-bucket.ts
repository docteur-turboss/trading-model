export class TokenBucket {
	private _capacity: number;
	private _refillRate: number;
	private _refillIntervalMs: number;
	private _tokens: number;
	private _lastRefill: number;
	private _metricCallback: ((usage: number) => void) | null = null;

	constructor(capacity: number, refillRate: number, refillIntervalMs: number) {
		this._capacity = capacity;
		this._refillRate = refillRate;
		this._refillIntervalMs = refillIntervalMs;
		this._tokens = capacity;
		this._lastRefill = Date.now();
	}

	onMetric(cb: (usage: number) => void): void {
		this._metricCallback = cb;
	}

	private _refill(): void {
		const intervals = this._computeRefillIntervals();
		if (intervals === 0) {
			return;
		}
		this._tokens = Math.min(
			this._capacity,
			this._tokens + this._refillRate * intervals
		);
		this._lastRefill += intervals * this._refillIntervalMs;
	}

	private _computeRefillIntervals(): number {
		const elapsed = Date.now() - this._lastRefill;
		if (elapsed < this._refillIntervalMs) {
			return 0;
		}
		return Math.floor(elapsed / this._refillIntervalMs);
	}

	tryConsume(count = 1): boolean {
		this._refill();
		if (this._tokens >= count) {
			this._tokens -= count;
			this._metricCallback?.(this.getUsage());
			return true;
		}
		return false;
	}

	getAvailable(): number {
		this._refill();
		return Math.floor(this._tokens);
	}

	getCapacity(): number {
		return this._capacity;
	}

	getUsage(): number {
		return 1 - this.getAvailable() / this._capacity;
	}
}
