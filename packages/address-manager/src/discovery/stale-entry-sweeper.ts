import type { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

export class StaleEntrySweeper {
	private readonly _sweepHandle = new TimerHandle();

	constructor(
		private readonly _instances: Map<string, CircuitStateMachine>,
		private readonly _sweepIntervalMs: number,
		private readonly _onSweepInstance?: (instanceId: string) => void
	) {
		this._start();
	}

	stop(): void {
		this._sweepHandle.stop();
	}

	private _start(): void {
		this._sweepHandle.startInterval(
			() => this._sweep(),
			this._sweepIntervalMs
		);
		this._sweepHandle.unref();
	}

	private _sweep(): void {
		const now = Date.now();
		for (const [instanceId, machine] of this._instances) {
			if (machine.getState(now) === "closed" && machine.failures === 0) {
				this._instances.delete(instanceId);
				this._onSweepInstance?.(instanceId);
			}
		}
	}
}
