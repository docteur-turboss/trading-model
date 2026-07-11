import { CircuitState } from "@trading-model/common/domain/circuit-state";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

export class StaleEntrySweeper {
	private readonly _sweepHandle = new TimerHandle();

	constructor(
		private readonly _instances: Map<InstanceId, CircuitStateMachine>,
		private readonly _sweepIntervalMs: number,
		private readonly _onSweepInstance?: (instanceId: InstanceId) => void
	) {
		this._start();
	}

	stop(): void {
		this._sweepHandle.stop();
	}

	private _start(): void {
		this._sweepHandle.startInterval(() => this._sweep(), this._sweepIntervalMs);
		this._sweepHandle.unref();
	}

	private _sweep(): void {
		const now = Date.now();
		for (const [instanceId, machine] of this._instances) {
			if (
				machine.getState(now) === CircuitState.CLOSED &&
				machine.failures === 0
			) {
				this._instances.delete(instanceId);
				this._onSweepInstance?.(instanceId);
			}
		}
	}
}
