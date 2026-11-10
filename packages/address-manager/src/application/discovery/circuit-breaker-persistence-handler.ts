import { logger } from "@trading-model/http/infrastructure/logger";
import {
	type InstanceId,
	toInstanceId,
} from "@trading-model/primitives/primitives";
import type { CircuitStateMachine } from "@trading-model/reliability/circuit-state-machine";
import type { CircuitBreakerPersistence } from "../../adapters/outbound/discovery/circuit-breaker-persistence";
import type { PersistedCircuitState } from "../../domain/ports/service-cache.port";
import type { ForEachMachineFn } from "../../infrastructure/discovery/circuit-breaker-sweeper";
import {
	CircuitBreakerSweeper,
	sweepIdleClosedMachines,
} from "../../infrastructure/discovery/circuit-breaker-sweeper";

export class CircuitBreakerPersistenceHandler {
	private readonly _sweeper: CircuitBreakerSweeper;

	constructor(
		private readonly _persistence: CircuitBreakerPersistence,
		private readonly _halfOpenTimeoutMs: number
	) {
		this._sweeper = new CircuitBreakerSweeper();
	}

	startSweeper(
		forEachMachine: ForEachMachineFn,
		removeMachine: (key: string) => void,
		isStale?: (key: string) => boolean
	): void {
		this._sweeper.start(() =>
			sweepIdleClosedMachines(forEachMachine, removeMachine, isStale)
		);
	}

	loadFromStore(instanceId: InstanceId): Promise<PersistedCircuitState | null> {
		return this._persistence.loadFromStore(instanceId);
	}

	onRecordSuccess(instanceId: InstanceId, machine: CircuitStateMachine): void {
		const snap = machine.snapshot();
		if (snap.openUntil > 0) {
			logger.info("Circuit breaker closed for instance", { instanceId });
		}
		this._persistence.deletePersistedState(instanceId);
		this._persistence.invalidateCache(instanceId);
	}

	onRecordFailure(
		instanceId: InstanceId,
		machine: CircuitStateMachine,
		opened: boolean
	): void {
		if (opened) {
			logger.warn("Circuit breaker opened for instance", {
				instanceId,
				failures: machine.failures,
			});
		}
		this._persistence.persistMachineState(
			instanceId,
			machine,
			this._halfOpenTimeoutMs
		);
	}

	clear(forEachMachine: (fn: (key: string) => void) => void): void {
		forEachMachine((key) => {
			this._persistence.deletePersistedState(toInstanceId(key));
		});
		this._sweeper.stop();
	}

	stop(): void {
		this._sweeper.stop();
	}
}
