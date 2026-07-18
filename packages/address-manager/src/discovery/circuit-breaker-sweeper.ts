import { CircuitState } from "@trading-model/common/domain/circuit-state";
import type { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

export const SWEEP_INTERVAL_MS = 60_000;

export type ForEachMachineFn = (
	fn: (key: string, machine: CircuitStateMachine) => void
) => void;

export class CircuitBreakerSweeper {
	private readonly _handle = new TimerHandle();

	start(sweepFn: () => void): void {
		this._handle.startInterval(sweepFn, SWEEP_INTERVAL_MS);
		this._handle.unref();
	}

	stop(): void {
		this._handle.stop();
	}
}

export function sweepIdleClosedMachines(
	forEachMachine: ForEachMachineFn,
	removeMachine: (key: string) => void
): void {
	const now = Date.now();
	const toRemove: string[] = [];
	forEachMachine((key, machine) => {
		if (
			machine.getState(now) === CircuitState.CLOSED &&
			machine.failures === 0
		) {
			toRemove.push(key);
		}
	});
	for (const key of toRemove) {
		removeMachine(key);
	}
}
