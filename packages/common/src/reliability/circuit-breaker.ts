import { BaseCircuitBreaker, type CircuitBreakerConfig } from "./base-circuit-breaker";

export type { CircuitState } from "../domain/circuit-state";
export type { CircuitBreakerConfig };

/**
 * Generic circuit breaker tracking success/failure for a keyed resource.
 * Each resource (e.g., hostname, service name) has its own entry.
 */
export class CircuitBreaker extends BaseCircuitBreaker {
	constructor(config?: Partial<CircuitBreakerConfig>) {
		super(config);
	}
}
