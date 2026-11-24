import type { CircuitState } from "@trading-model/primitives/circuit-state";
import {
	type CircuitBreakerConfig,
	CircuitStateMachine,
	DEFAULT_CIRCUIT_CONFIG,
} from "./circuit-state-machine";

export type { CircuitBreakerConfig, CircuitState };

/** Keyed circuit breaker: one state machine per target key. */
export class CircuitBreaker {
	private readonly _machines = new Map<string, CircuitStateMachine>();
	private readonly _config: CircuitBreakerConfig;

	constructor(config?: Partial<CircuitBreakerConfig>) {
		this._config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
	}

	getMachine(key: string): CircuitStateMachine {
		let machine = this._machines.get(key);
		if (!machine) {
			machine = new CircuitStateMachine(this._config);
			this._machines.set(key, machine);
		}
		return machine;
	}

	check(key: string): CircuitState {
		return this.getMachine(key).check();
	}
	recordSuccess(key: string): void {
		this.getMachine(key).recordSuccess();
	}
	recordFailure(key: string): boolean {
		return this.getMachine(key).recordFailure();
	}
}
