import type { CircuitState } from "../domain/circuit-state";

/** Circuit breaker for single-instance tracking (no key parameter). */
export interface IUnkeyedCircuitBreaker {
	check(): CircuitState;
	isAllowed(): boolean;
	recordSuccess(): void;
	recordFailure(count?: number, threshold?: number): void;
	isOpen(): boolean;
	getState(): CircuitState;
	getFailureCount(): number;
	clear(): void;
	call<TResult>(
		fn: () => Promise<TResult>,
		fallback?: () => TResult,
	): Promise<TResult>;
}

/** Circuit breaker for multi-instance tracking (key parameter isolates targets). */
export interface ICircuitBreaker {
	check(key: string): CircuitState;
	isAllowed(key: string): boolean;
	recordSuccess(key: string): void;
	recordFailure(key: string, count?: number, threshold?: number): void;
	isOpen(key: string): boolean;
	getState(key: string): CircuitState;
	getFailureCount(key: string): number;
	clear(): void;
	call<TResult>(
		key: string,
		fn: () => Promise<TResult>,
		fallback?: () => TResult,
	): Promise<TResult>;
}
