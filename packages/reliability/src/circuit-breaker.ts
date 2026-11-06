import { getLogger } from "@trading-model/contracts/logger-registry";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import {
	type CircuitBreakerConfig,
	CircuitStateMachine,
	DEFAULT_CIRCUIT_CONFIG,
} from "./circuit-state-machine";
import { LatencyTracker } from "./latency-tracker";

export type { CircuitBreakerConfig, CircuitState };

/** Keyed circuit breaker: one state machine per target key, optional latency tracking. */
export class CircuitBreaker {
	private readonly _machines = new Map<string, CircuitStateMachine>();
	private readonly _config: CircuitBreakerConfig;
	private readonly _latencyTracker: LatencyTracker | undefined;

	constructor(
		config?: Partial<CircuitBreakerConfig>,
		options?: {
			latencyWindowSize?: number;
			latencyP99ThresholdMs?: number;
		}
	) {
		this._config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
		this._latencyTracker =
			options?.latencyWindowSize && options.latencyWindowSize > 0
				? new LatencyTracker(
						options.latencyWindowSize,
						options.latencyP99ThresholdMs ?? 0
					)
				: undefined;
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

	check(key: string): CircuitState {
		return this.getMachine(key).check();
	}
	isAllowed(key: string): boolean {
		return this.getMachine(key).isAllowed();
	}
	recordSuccess(key: string): void {
		this.getMachine(key).recordSuccess();
		this._latencyTracker?.delete(key);
	}
	recordFailure(key: string, count?: number, threshold?: number): boolean {
		return this.getMachine(key).recordFailure(count ?? 1, threshold);
	}
	isOpen(key: string): boolean {
		return this.getMachine(key).isOpen();
	}
	getState(key: string): CircuitState {
		return this.getMachine(key).getState();
	}
	getFailureCount(key: string): number {
		return this.getMachine(key).getFailureCount();
	}
	async call<TResult>(
		key: string,
		fn: () => Promise<TResult>,
		fallback?: () => TResult
	): Promise<TResult> {
		const machine = this.getMachine(key);
		const state = machine.check();
		if (state === CircuitState.OPEN) {
			if (fallback) {
				return fallback();
			}
			throw new Error(`Circuit breaker OPEN: ${key}`);
		}
		try {
			const result = await fn();
			machine.recordSuccess();
			return result;
		} catch (error) {
			machine.recordFailure();
			getLogger().warn(`Circuit breaker recorded failure for: ${key}`);
			if (fallback) {
				return fallback();
			}
			throw error;
		}
	}
	recordLatency(key: string, durationMs: number): void {
		const p99 = this._latencyTracker?.update(key, durationMs);
		if (p99 !== undefined && p99 > 0) {
			this.recordFailure(key);
		}
	}

	getStateSummary(): Record<CircuitState, number> {
		const summary: Record<CircuitState, number> = {
			[CircuitState.CLOSED]: 0,
			[CircuitState.OPEN]: 0,
			[CircuitState.HALF_OPEN]: 0,
		};
		for (const machine of this._machines.values()) {
			summary[machine.getState()]++;
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
		this._latencyTracker?.clear();
	}
}
