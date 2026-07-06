import type { CircuitState } from "../domain/circuit-state";

export interface ICircuitBreaker {
	check(key: string): CircuitState;
	isAllowed(key: string): boolean;
	recordSuccess(key: string): void;
	recordFailure(key: string, count?: number, threshold?: number): void;
	isOpen(key: string): boolean;
	getState(key: string): CircuitState;
	getFailureCount(key: string): number;
	clear(): void;
}
