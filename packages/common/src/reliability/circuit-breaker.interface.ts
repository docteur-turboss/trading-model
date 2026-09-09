import type { CircuitState } from "../domain/circuit-state";

/** Circuit breaker for single-instance tracking (no key parameter). */
export interface IUnkeyedCircuitBreaker {
	check(): CircuitState;
	isAllowed(): boolean;
	recordSuccess(): void;
	recordFailure(count?: number, threshold?: number): boolean;
	isOpen(): boolean;
	getState(): CircuitState;
	getFailureCount(): number;
	clear(): void;
	call<TResult>(
		fn: () => Promise<TResult>,
		fallback?: () => TResult
	): Promise<TResult>;
}

/** Circuit breaker for multi-instance tracking (key parameter isolates targets). */
export interface ICircuitBreaker<TKey extends string = string> {
	check(key: TKey): CircuitState;
	isAllowed(key: TKey): boolean;
	recordSuccess(key: TKey): void;
	recordFailure(key: TKey, count?: number, threshold?: number): boolean;
	isOpen(key: TKey): boolean;
	getState(key: TKey): CircuitState;
	getFailureCount(key: TKey): number;
	clear(): void;
	call<TResult>(
		key: TKey,
		fn: () => Promise<TResult>,
		fallback?: () => TResult
	): Promise<TResult>;
	recordLatency?(key: TKey, durationMs: number): void;
	getStateSummary?(): Record<CircuitState, number>;
	loadFromStore?(key: TKey): Promise<void>;
}
