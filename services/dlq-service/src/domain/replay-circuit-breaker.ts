import { MessageManagerCircuitBreaker } from "../config/mm-circuit-breaker";

export interface ReplayCircuitBreakerConfig {
	failureThreshold?: number;
	resetMs?: number;
	halfOpenMaxAttempts?: number;
}

export class ReplayCircuitBreaker extends MessageManagerCircuitBreaker {
	constructor(config: ReplayCircuitBreakerConfig = {}) {
		super({
			...config,
			name: "replay",
		});
	}
}
