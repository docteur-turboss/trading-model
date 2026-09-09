import { CircuitState } from "../domain/circuit-state";
import type { ICircuitBreaker } from "./circuit-breaker.interface";
import { CircuitMachineRegistry } from "./circuit-machine-registry";
import type {
	CircuitBreakerConfig,
	CircuitStateMachine,
} from "./circuit-state-machine";
import { DEFAULT_CIRCUIT_CONFIG } from "./circuit-state-machine";
import { LatencyTracker } from "./latency-tracker";

export type { CircuitBreakerConfig, CircuitState };

export class CircuitBreaker implements ICircuitBreaker<string> {
	private readonly _machines: CircuitMachineRegistry;
	private readonly _config: CircuitBreakerConfig;
	private readonly _latencyTracker: LatencyTracker | undefined;
	protected readonly _onPersist?: (
		key: string,
		machine: CircuitStateMachine
	) => void;
	protected readonly _onClear?: (key: string) => void;

	constructor(
		config?: Partial<CircuitBreakerConfig>,
		options?: {
			latencyWindowSize?: number;
			latencyP99ThresholdMs?: number;
			onPersist?: (key: string, machine: CircuitStateMachine) => void;
			onClear?: (key: string) => void;
		}
	) {
		this._config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
		this._machines = new CircuitMachineRegistry(this._config);
		this._latencyTracker =
			options?.latencyWindowSize && options.latencyWindowSize > 0
				? new LatencyTracker(
						options.latencyWindowSize,
						options.latencyP99ThresholdMs ?? 0
					)
				: undefined;
		this._onPersist = options?.onPersist;
		this._onClear = options?.onClear;
	}

	getMachine(key: string): CircuitStateMachine {
		return this._machines.getMachine(key);
	}

	forEachMachine(
		fn: (key: string, machine: CircuitStateMachine) => void
	): void {
		this._machines.forEachMachine(fn);
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
		const opened = this.getMachine(key).recordFailure(count ?? 1, threshold);
		if (opened && this._onPersist) {
			this._onPersist(key, this.getMachine(key));
		}
		return opened;
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
			const { logger } = await import("../config/logger");
			logger.warn(`Circuit breaker recorded failure for: ${key}`);
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
		return this._machines.getStateSummary();
	}

	removeMachine(key: string): void {
		this._machines.removeMachine(key);
	}

	clear(): void {
		this._machines.clear();
		this._latencyTracker?.clear();
	}
}
