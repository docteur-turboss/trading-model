import type { CircuitState } from "../domain/circuit-state";

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
