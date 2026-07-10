import { logger } from "@trading-model/common/config/logger";
import { CircuitState } from "@trading-model/common/domain/circuit-state";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import { StaleEntrySweeper } from "./stale-entry-sweeper";

export interface INstanceState {
	failures: number;
	lastFailureTime: number;
	state: CircuitState;
}

const SWEEP_INTERVAL_MS = 60_000;

export class CircuitBreakerState {
	private readonly _instances = new Map<InstanceId, CircuitStateMachine>();
	private readonly _failureThreshold: number;
	private readonly _sweeper: StaleEntrySweeper;

	constructor(
		failureThreshold: number,
		private readonly _halfOpenTimeoutMs: number,
		onSweepInstance?: (instanceId: InstanceId) => void
	) {
		this._failureThreshold = failureThreshold;
		this._sweeper = new StaleEntrySweeper(
			this._instances,
			SWEEP_INTERVAL_MS,
			onSweepInstance
		);
	}

	getOrCreateMachine(instanceId: InstanceId): CircuitStateMachine {
		let machine = this._instances.get(instanceId);
		if (!machine) {
			machine = new CircuitStateMachine({
				failureThreshold: this._failureThreshold,
				cooldownMs: this._halfOpenTimeoutMs,
				halfOpenMaxAttempts: 1,
			});
			this._instances.set(instanceId, machine);
		}
		return machine;
	}
	recordSuccess(instanceId: InstanceId): void {
		this._instances.get(instanceId)?.recordSuccess();
	}
	recordFailure(instanceId: InstanceId): boolean {
		return this.getOrCreateMachine(instanceId).recordFailure();
	}
	getOrCreateState(instanceId: InstanceId, now: number): INstanceState {
		const machine = this.getOrCreateMachine(instanceId);
		return {
			failures: machine.failures,
			lastFailureTime: now,
			state: machine.getState(now),
		};
	}
	checkOpenThreshold(instanceId: InstanceId, _state: INstanceState): void {
		const machine = this._instances.get(instanceId);
		if (!machine) {
			return;
		}
		if (machine.failures >= this._failureThreshold) {
			logger.warn("Circuit breaker opened for instance", {
				instanceId,
				failures: machine.failures,
			});
		}
	}
	tryHalfOpen(instanceId: InstanceId, state: INstanceState): boolean {
		const now = Date.now();
		if (
			state.state === CircuitState.OPEN &&
			now - state.lastFailureTime >= this._halfOpenTimeoutMs
		) {
			logger.info("Circuit breaker half-open for instance", { instanceId });
			return true;
		}
		return false;
	}
	logHalfOpenClose(instanceId: InstanceId, state: INstanceState): void {
		if (state.state === CircuitState.HALF_OPEN) {
			logger.info("Circuit breaker closed for instance", { instanceId });
		}
	}
	getInstanceState(instanceId: InstanceId): INstanceState | undefined {
		const machine = this._instances.get(instanceId);
		if (!machine) {
			return;
		}
		const snap = machine.snapshot();
		return {
			failures: snap.failures,
			lastFailureTime:
				snap.openUntil > 0 ? snap.openUntil - this._halfOpenTimeoutMs : 0,
			state: machine.getState(Date.now()),
		};
	}
	get instances(): Map<InstanceId, CircuitStateMachine> {
		return this._instances;
	}
	clear(): void {
		this._instances.clear();
		this._sweeper.stop();
	}
	stop(): void {
		this._sweeper.stop();
	}
}
