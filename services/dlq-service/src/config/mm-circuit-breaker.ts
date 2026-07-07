import type { CircuitState } from "@trading-model/common/domain/circuit-state";
import type { CircuitBreakerConfig } from "@trading-model/common/reliability/circuit-state-machine";
import type { IUnkeyedCircuitBreaker } from "@trading-model/common/reliability/circuit-breaker.interface";
import { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import { logger } from "./logger";

interface MessageManagerCircuitBreakerConfig
	extends Partial<CircuitBreakerConfig> {
	name?: string;
	resetMs?: number;
}

export class MessageManagerCircuitBreaker implements IUnkeyedCircuitBreaker {
	private readonly _machine: CircuitStateMachine;
	private readonly _name: string;

	constructor(config?: MessageManagerCircuitBreakerConfig) {
		this._machine = new CircuitStateMachine({
			failureThreshold: config?.failureThreshold ?? 5,
			cooldownMs: config?.resetMs ?? config?.cooldownMs ?? 30_000,
			halfOpenMaxAttempts: config?.halfOpenMaxAttempts ?? 2,
		});
		this._name = config?.name ?? "message-manager";
	}

	isOpen(): boolean {
		return this._machine.isOpen(Date.now());
	}

	isAllowed(): boolean {
		return !this._machine.isOpen(Date.now());
	}

	check(): CircuitState {
		return this._machine.getState(Date.now());
	}

	recordSuccess(): void {
		this._machine.recordSuccess();
	}

	recordFailure(count?: number, threshold?: number): void {
		const prevState = this._machine.getState(Date.now());
		this._machine.recordFailure(count ?? 1, threshold);
		const currentState = this._machine.getState(Date.now());
		if (prevState !== "open" && currentState === "open") {
			const snapshot = this._machine.snapshot();
			logger.warn(
				`${this._name} circuit breaker ${prevState === "half-open" ? "re-opened during half-open" : "opened"}`,
				{
					failures: snapshot.failures,
					halfOpenAttempts: snapshot.halfOpenAttempts,
				}
			);
		}
	}

	getState(): CircuitState {
		return this._machine.getState(Date.now());
	}

	getFailureCount(): number {
		return this._machine.failures;
	}

	clear(): void {
		this._machine.reset();
	}

	async call<TResult>(
		fn: () => Promise<TResult>,
		fallback?: () => TResult
	): Promise<TResult> {
		if (!this.isAllowed()) {
			if (fallback) {
				return fallback();
			}
			throw new Error("Circuit breaker is OPEN");
		}
		try {
			const result = await fn();
			this.recordSuccess();
			return result;
		} catch (error) {
			this.recordFailure();
			throw error;
		}
	}
}
