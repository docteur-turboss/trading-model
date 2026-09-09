import { logger } from "@trading-model/common/config/logger";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import type { CircuitBreakerPersistence } from "../../adapters/outbound/discovery/circuit-breaker-persistence";
import type { PersistedCircuitState } from "../../domain/discovery/service-cache.interface";
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
		removeMachine: (key: string) => void
	): void {
		this._sweeper.start(() =>
			sweepIdleClosedMachines(forEachMachine, removeMachine)
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

	deletePersistedState(instanceId: InstanceId): void {
		this._persistence.deletePersistedState(instanceId);
	}

	clear(forEachMachine: (fn: (key: string) => void) => void): void {
		forEachMachine((key) => {
			this._persistence.deletePersistedState(key as unknown as InstanceId);
		});
		this._persistence.clear();
		this._sweeper.stop();
	}

	stop(): void {
		this._sweeper.stop();
	}
}
