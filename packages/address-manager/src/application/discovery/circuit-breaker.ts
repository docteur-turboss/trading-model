import { getLogger } from "@trading-model/contracts/logger-registry";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import type {
	DurationMs,
	InstanceId,
} from "@trading-model/primitives/primitives";
import { CircuitBreaker } from "@trading-model/reliability/circuit-breaker";
import type { CircuitBreakerConfig } from "@trading-model/reliability/circuit-state-machine";
import {
	DEFAULT_FAILURE_THRESHOLD,
	DEFAULT_HALF_OPEN_TIMEOUT_MS,
	DEFAULT_LATENCY_P99_THRESHOLD_MS,
	DEFAULT_LATENCY_WINDOW_SIZE,
} from "../../domain/discovery/circuit-breaker-constants";
import {
	CircuitBreakerSweeper,
	STALE_OPEN_MS,
	sweepIdleClosedMachines,
} from "../../infrastructure/discovery/circuit-breaker-sweeper";
import {
	CIRCUIT_BREAKER_STATE,
	recordCircuitState,
} from "../../infrastructure/metrics";

/** Tuning of a discovery circuit breaker: thresholds and timeouts. */
export interface CircuitBreakerOptions {
	failureThreshold?: number;
	halfOpenTimeoutMs?: number;
	latencyWindowSize?: number;
	latencyP99ThresholdMs?: number;
}

function buildCircuitConfig(
	failureThreshold: number,
	halfOpenTimeoutMs: number
): Partial<CircuitBreakerConfig> & { cooldownMs: DurationMs } {
	return {
		failureThreshold,
		cooldownMs: halfOpenTimeoutMs as DurationMs,
		halfOpenMaxAttempts: 1,
	};
}

/** Circuit breaker around discovery calls, with its state kept in memory. */
export class DiscoveryCircuitBreaker extends CircuitBreaker {
	private readonly _sweeper = new CircuitBreakerSweeper();
	/** Last time each key was consulted or fed; lets the sweeper expire machines of vanished instances. */
	private readonly _lastActivity = new Map<string, number>();

	constructor(options: CircuitBreakerOptions = {}) {
		const failureThreshold =
			options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
		const halfOpenTimeoutMs =
			options.halfOpenTimeoutMs ?? DEFAULT_HALF_OPEN_TIMEOUT_MS;
		const latencyWindowSize =
			options.latencyWindowSize ?? DEFAULT_LATENCY_WINDOW_SIZE;
		const latencyP99ThresholdMs =
			options.latencyP99ThresholdMs ?? DEFAULT_LATENCY_P99_THRESHOLD_MS;
		super(buildCircuitConfig(failureThreshold, halfOpenTimeoutMs), {
			latencyWindowSize,
			latencyP99ThresholdMs,
		});

		this._sweeper.start(() =>
			sweepIdleClosedMachines(
				(fn) => this.forEachMachine(fn),
				(key) => this.removeMachine(key),
				(key) => Date.now() - (this._lastActivity.get(key) ?? 0) > STALE_OPEN_MS
			)
		);
	}

	/** Consulted by discovery before handing out an instance: also publishes open to half-open. */
	isOpen(instanceId: InstanceId): boolean {
		const open = super.isOpen(instanceId);
		this._reportState(instanceId);
		return open;
	}

	isAllowed(instanceId: InstanceId): boolean {
		const machine = this.getMachine(instanceId);
		const currentState = machine.getState(Date.now());
		this._reportState(instanceId, currentState);
		return currentState !== CircuitState.OPEN;
	}

	recordSuccess(instanceId: InstanceId): void {
		if (this.getMachine(instanceId).snapshot().openUntil > 0) {
			getLogger().info("Circuit breaker closed for instance", { instanceId });
		}
		super.recordSuccess(instanceId);
		this._reportState(instanceId);
	}

	recordFailure(
		instanceId: InstanceId,
		count?: number,
		threshold?: number
	): boolean {
		const machine = this.getMachine(instanceId);
		const opened = machine.recordFailure(count ?? 1, threshold);
		if (opened) {
			getLogger().warn("Circuit breaker opened for instance", {
				instanceId,
				failures: machine.failures,
			});
		}
		this._reportState(instanceId);
		return opened;
	}

	removeMachine(key: string): void {
		super.removeMachine(key);
		this._lastActivity.delete(key);
		CIRCUIT_BREAKER_STATE.remove({ instanceId: key });
	}

	private _reportState(
		instanceId: InstanceId,
		state: CircuitState = this.getState(instanceId)
	): void {
		this._lastActivity.set(instanceId, Date.now());
		recordCircuitState(instanceId, state, this.getStateSummary());
	}

	clear(): void {
		this._lastActivity.clear();
		CIRCUIT_BREAKER_STATE.reset();
		this._sweeper.stop();
		super.clear();
	}

	stop(): void {
		this._sweeper.stop();
	}
}
