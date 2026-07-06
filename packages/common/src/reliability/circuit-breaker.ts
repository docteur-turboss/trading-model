import type { CircuitState } from "../domain/circuit-state";

export type { CircuitState };

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
	private readonly _entries = new Map<string, CircuitBreakerEntry>();
	private readonly _config: CircuitBreakerConfig;

	constructor(config?: Partial<CircuitBreakerConfig>) {
		this._config = { ...DEFAULT_CONFIG, ...config };
	}

	private _getEntry(key: string): CircuitBreakerEntry {
		let entry = this._entries.get(key);
		if (!entry) {
			entry = { failures: 0, state: "closed", lastFailureTime: 0 };
			this._entries.set(key, entry);
		}
		return entry;
	}

	/**
	 * Checks whether the circuit allows a request.
	 * @throws with a message if the circuit is open (caller should catch or handle).
	 * @returns the current state (closed, half-open) when request is allowed.
	 */
	check(key: string): CircuitState {
		const entry = this._getEntry(key);
		if (entry.state === "open") {
			if (Date.now() - entry.lastFailureTime >= this._config.cooldownMs) {
				entry.state = "half-open";
				return "half-open";
			}
			// Circuit is open — caller should throw
			return "open";
		}
		return entry.state;
	}

	recordSuccess(key: string): void {
		const entry = this._getEntry(key);
		entry.failures = 0;
		entry.state = "closed";
	}

	recordFailure(key: string, count = 1, threshold?: number): void {
		const entry = this._getEntry(key);
		entry.failures += count;
		entry.lastFailureTime = Date.now();
		if (entry.failures >= (threshold ?? this._config.failureThreshold)) {
			entry.state = "open";
		}
	}
}
