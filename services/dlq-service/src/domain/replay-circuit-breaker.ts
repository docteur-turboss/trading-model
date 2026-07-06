import { MessageManagerCircuitBreaker } from "../config/mm-circuit-breaker";

export interface ReplayCircuitBreakerConfig {
	circuitThreshold?: number;
	circuitCooldownMs?: number;
	halfOpenMaxAttempts?: number;
}

export class ReplayCircuitBreaker extends MessageManagerCircuitBreaker {
	constructor(config: ReplayCircuitBreakerConfig = {}) {
		super({
			failureThreshold: config.circuitThreshold,
			resetMs: config.circuitCooldownMs,
			halfOpenMaxAttempts: config.halfOpenMaxAttempts,
			name: "replay",
		});
	}
}
