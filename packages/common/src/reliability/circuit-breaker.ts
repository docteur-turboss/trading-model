import type { Logger } from "../config/logger";
import { CircuitState } from "../domain/circuit-state";
import type { ICircuitBreaker } from "./circuit-breaker.interface";
import type { CircuitBreakerConfig } from "./circuit-state-machine";
import {
	CircuitStateMachine,
	DEFAULT_CIRCUIT_CONFIG,
} from "./circuit-state-machine";

export type { CircuitBreakerConfig, CircuitState };

export class CircuitBreaker implements ICircuitBreaker {
	private readonly _machines = new Map<string, CircuitStateMachine>();
	private readonly _config: CircuitBreakerConfig;

	constructor(config?: Partial<CircuitBreakerConfig>) {
		this._config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
	}

	private _getMachine(key: string): CircuitStateMachine {
		let machine = this._machines.get(key);
		if (!machine) {
			machine = new CircuitStateMachine(this._config);
			this._machines.set(key, machine);
		}
		return machine;
	}

	check(key: string): CircuitState {
		return this._getMachine(key).check();
	}
	isAllowed(key: string): boolean {
		return this._getMachine(key).isAllowed();
	}
	recordSuccess(key: string): void {
		this._getMachine(key).recordSuccess();
	}
	recordFailure(key: string, count?: number, threshold?: number): void {
		this._getMachine(key).recordFailure(count ?? 1, threshold);
	}
	isOpen(key: string): boolean {
		return this._getMachine(key).isOpen();
	}
	getState(key: string): CircuitState {
		return this._getMachine(key).getState();
	}
	getFailureCount(key: string): number {
		return this._getMachine(key).getFailureCount();
	}
	async call<TResult>(
		key: string,
		fn: () => Promise<TResult>,
		fallback?: () => TResult
	): Promise<TResult> {
		const machine = this._getMachine(key);
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
	clear(): void {
		for (const machine of this._machines.values()) {
			machine.clear();
		}
		this._machines.clear();
	}
}
