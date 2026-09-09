import { CircuitState } from "../domain/circuit-state";
import type { CircuitBreakerConfig } from "./circuit-state-machine";
import { CircuitStateMachine } from "./circuit-state-machine";

/**
 * Owns the per-key circuit state machines and their lifecycle.
 * @internal Used by CircuitBreaker to separate keyed-machine management
 * from orchestration (latency tracking, persistence hooks, call flow).
 */
export class CircuitMachineRegistry {
	private readonly _machines = new Map<string, CircuitStateMachine>();
	private readonly _config: CircuitBreakerConfig;

	constructor(config: CircuitBreakerConfig) {
		this._config = config;
	}

	getMachine(key: string): CircuitStateMachine {
		let machine = this._machines.get(key);
		if (!machine) {
			machine = new CircuitStateMachine(this._config);
			this._machines.set(key, machine);
		}
		return machine;
	}

	forEachMachine(
		fn: (key: string, machine: CircuitStateMachine) => void
	): void {
		for (const [key, machine] of this._machines) {
			fn(key, machine);
		}
	}

	getStateSummary(): Record<CircuitState, number> {
		const summary: Record<CircuitState, number> = {
			[CircuitState.CLOSED]: 0,
			[CircuitState.OPEN]: 0,
			[CircuitState.HALF_OPEN]: 0,
		};
		for (const machine of this._machines.values()) {
			const state = machine.getState();
			summary[state]++;
		}
		return summary;
	}

	removeMachine(key: string): void {
		this._machines.delete(key);
	}

	clear(): void {
		for (const machine of this._machines.values()) {
			machine.clear();
		}
		this._machines.clear();
	}
}
