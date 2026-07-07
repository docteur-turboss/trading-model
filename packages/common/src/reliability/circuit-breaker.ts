import { logger } from "../config/logger";
import type { CircuitState } from "../domain/circuit-state";
import type { ICircuitBreaker } from "./circuit-breaker.interface";

export interface CircuitBreakerEntry {
	failures: number;
	state: CircuitState;
	lastFailureTime: number;
}

export interface CircuitBreakerConfig {
	failureThreshold: number;
	cooldownMs: number;
	halfOpenMaxAttempts?: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = { failureThreshold: 5, cooldownMs: 30_000 };

export type { CircuitState };

export class CircuitBreaker implements ICircuitBreaker {
	protected readonly _entries = new Map<string, CircuitBreakerEntry>();
	protected readonly _config: CircuitBreakerConfig;

	constructor(config?: Partial<CircuitBreakerConfig>) { this._config = { ...DEFAULT_CONFIG, ...config }; }

	protected _getEntry(key: string): CircuitBreakerEntry {
		let entry = this._entries.get(key);
		if (!entry) { entry = { failures: 0, state: "closed", lastFailureTime: 0 }; this._entries.set(key, entry); }
		return entry;
	}
	protected _getState(key: string): CircuitBreakerEntry | undefined { return this._entries.get(key); }
	protected _setState(key: string, entry: CircuitBreakerEntry): void { this._entries.set(key, entry); }

	check(key: string): CircuitState {
		const entry = this._getEntry(key);
		if (entry.state === "open") {
			if (Date.now() - entry.lastFailureTime >= this._config.cooldownMs) { entry.state = "half-open"; return "half-open"; }
			return "open";
		}
		return entry.state;
	}
	isAllowed(key: string): boolean { return this.check(key) !== "open"; }
	recordSuccess(key: string): void { const entry = this._getEntry(key); entry.failures = 0; entry.state = "closed"; }
	recordFailure(key: string, count = 1, threshold?: number): void {
		const entry = this._getEntry(key);
		entry.failures += count;
		entry.lastFailureTime = Date.now();
		if (entry.failures >= (threshold ?? this._config.failureThreshold)) entry.state = "open";
	}
	isOpen(key: string): boolean { return this._entries.get(key)?.state === "open"; }
	getState(key: string): CircuitState { return this._entries.get(key)?.state ?? "closed"; }
	getFailureCount(key: string): number { return this._entries.get(key)?.failures ?? 0; }
	async call<TResult>(key: string, fn: () => Promise<TResult>, fallback?: () => TResult): Promise<TResult> {
		const state = this.check(key);
		if (state === "open") { if (fallback) return fallback(); throw new Error(`Circuit breaker OPEN: ${key}`); }
		try { const result = await fn(); this.recordSuccess(key); return result; }
		catch (error) { this.recordFailure(key); logger.warn(`Circuit breaker recorded failure for: ${key}`); if (fallback) return fallback(); throw error; }
	}
	clear(): void { this._entries.clear(); }
}
