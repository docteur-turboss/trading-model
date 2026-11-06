import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import { toDurationMs } from "@trading-model/primitives/primitives";
import type { CircuitStateMachine } from "@trading-model/reliability/circuit-state-machine";

export const SWEEP_INTERVAL_MS = toDurationMs(60_000);
/** A non-closed machine nobody touched for this long belongs to a vanished instance. */
export const STALE_OPEN_MS = toDurationMs(5 * 60_000);

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
	removeMachine: (key: string) => void,
	isStale: (key: string) => boolean = () => false
): void {
	const now = Date.now();
	const toRemove: string[] = [];
	forEachMachine((key, machine) => {
		if (
			(machine.getState(now) === CircuitState.CLOSED &&
				machine.failures === 0) ||
			isStale(key)
		) {
			toRemove.push(key);
		}
	});
	for (const key of toRemove) {
		removeMachine(key);
	}
}
