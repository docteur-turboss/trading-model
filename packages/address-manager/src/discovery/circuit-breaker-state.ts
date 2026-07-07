import { logger } from "@trading-model/common/config/logger";
import type { CircuitState } from "@trading-model/common/domain/circuit-state";
import { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

export interface INstanceState {
	failures: number;
	lastFailureTime: number;
	state: CircuitState;
}

const MAX_ENTRY_AGE_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;

export class CircuitBreakerState {
	private readonly _instances = new Map<string, CircuitStateMachine>();
	private readonly _failureThreshold: number;
	private readonly _sweepHandle = new TimerHandle();

	constructor(
		failureThreshold: number,
		private readonly _halfOpenTimeoutMs: number,
		private readonly _onSweepInstance?: (instanceId: string) => void
	) {
		this._failureThreshold = failureThreshold;
		this._startSweeper();
	}

	getOrCreateMachine(instanceId: string): CircuitStateMachine {
		let machine = this._instances.get(instanceId);
		if (!machine) {
			machine = new CircuitStateMachine({
				failureThreshold: this._failureThreshold,
				cooldownMs: this._halfOpenTimeoutMs,
			});
			this._instances.set(instanceId, machine);
		}
		return machine;
	}

	recordSuccess(instanceId: string): void {
		const machine = this._instances.get(instanceId);
		if (machine) {
			machine.recordSuccess();
		}
	}

	recordFailure(instanceId: string): boolean {
		const machine = this.getOrCreateMachine(instanceId);
		return machine.recordFailure(Date.now());
	}

	getOrCreateState(instanceId: string, now: number): INstanceState {
		const machine = this.getOrCreateMachine(instanceId);
		return {
			failures: machine.failures,
			lastFailureTime: now,
			state: machine.getState(now),
		};
	}

	checkOpenThreshold(instanceId: string, _state: INstanceState): void {
		const machine = this._instances.get(instanceId);
		if (!machine) return;
		if (machine.failures >= this._failureThreshold) {
			logger.warn("Circuit breaker opened for instance", {
				instanceId,
				failures: machine.failures,
			});
		}
	}

	tryHalfOpen(instanceId: string, state: INstanceState): boolean {
		const now = Date.now();
		const currentState = state.state;
		if (
			currentState === "open" &&
			now - state.lastFailureTime >= this._halfOpenTimeoutMs
		) {
			logger.info("Circuit breaker half-open for instance", { instanceId });
			return true;
		}
		return false;
	}

	logHalfOpenClose(instanceId: string, state: INstanceState): void {
		if (state.state === "half-open") {
			logger.info("Circuit breaker closed for instance", { instanceId });
		}
	}

	getInstanceState(instanceId: string): INstanceState | undefined {
		const machine = this._instances.get(instanceId);
		if (!machine) return;
		const snap = machine.snapshot();
		return {
			failures: snap.failures,
			lastFailureTime: 0,
			state: machine.getState(Date.now()),
		};
	}

	get instances(): Map<string, CircuitStateMachine> {
		return this._instances;
	}

	clear(): void {
		this._instances.clear();
		this._stopSweeper();
	}

	stop(): void {
		this._stopSweeper();
	}

	private _startSweeper(): void {
		this._sweepHandle.startInterval(
			() => this._sweepStaleEntries(),
			SWEEP_INTERVAL_MS
		);
		this._sweepHandle.unref();
	}

	private _sweepStaleEntries(): void {
		const now = Date.now();
		for (const [instanceId, machine] of this._instances) {
			if (machine.getState(now) === "closed" && machine.failures === 0) {
				this._instances.delete(instanceId);
				this._onSweepInstance?.(instanceId);
			}
		}
	}

	private _stopSweeper(): void {
		this._sweepHandle.stop();
	}
}
