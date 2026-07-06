import type { Message } from "@trading-model/common/contracts/message.types";
import { CircuitState } from "@trading-model/common/domain/circuit-state";
import type { ICircuitBreaker } from "@trading-model/common/reliability/circuit-breaker.interface";
import { logger } from "../../config/logger";
import type { MessageDeliveryPort } from "./message-delivery-port";

const CIRCUIT_BREAKER_THRESHOLD = 5;

/**
 * Tracks consecutive delivery failures and opens the circuit when the
 * threshold is reached, preventing cascading failures and routing
 * subsequent messages directly to the DLQ.
 */
export class DeliveryCircuitBreaker implements ICircuitBreaker {
	private _failureCount = 0;

	constructor(
		private readonly _topic: string,
		private readonly _serviceName: string
	) {}

	/** @deprecated Use {@link clear} instead. */
	reset(): void {
		this._failureCount = 0;
	}

	clear(): void {
		this.reset();
	}

	// --- ICircuitBreaker implementation (key-based overloads delegate to no-arg impl) ---

	recordFailure(): void;
	recordFailure(_key: string, _count?: number, _threshold?: number): void;
	recordFailure(_key?: string, _count?: number, _threshold?: number): void {
		this._failureCount++;
	}

	recordSuccess(): void;
	recordSuccess(_key: string): void;
	recordSuccess(_key?: string): void {
		this.reset();
	}

	isOpen(): boolean;
	isOpen(_key: string): boolean;
	isOpen(_key?: string): boolean {
		return this._failureCount >= CIRCUIT_BREAKER_THRESHOLD;
	}

	isAllowed(): boolean;
	isAllowed(_key: string): boolean;
	isAllowed(_key?: string): boolean {
		return !this.isOpen();
	}

	getState(): CircuitState;
	getState(_key: string): CircuitState;
	getState(_key?: string): CircuitState {
		return this.isOpen() ? CircuitState.OPEN : CircuitState.CLOSED;
	}

	getFailureCount(): number;
	getFailureCount(_key: string): number;
	getFailureCount(_key?: string): number {
		return this._failureCount;
	}

	// --- ICircuitBreaker check (different from legacy check that takes message+deliveryPort) ---

	check(_key: string): CircuitState;

	/**
	 * Checks whether the circuit is open. If so, logs a warning and routes
	 * the message to the DLQ without attempting delivery.
	 *
	 * @returns `true` when the circuit is open (caller should skip delivery).
	 */
	check<TData>(
		message: Message<TData>,
		deliveryPort: MessageDeliveryPort
	): Promise<boolean>;

	check<TData>(
		keyOrMessage?: string | Message<TData>,
		deliveryPort?: MessageDeliveryPort
	): CircuitState | Promise<boolean> {
		if (typeof keyOrMessage === "string") {
			return this.isOpen() ? CircuitState.OPEN : CircuitState.CLOSED;
		}
		const message = keyOrMessage as Message<TData> | undefined;
		if (!(message && deliveryPort)) {
			return this.isOpen() ? CircuitState.OPEN : CircuitState.CLOSED;
		}
		if (!this.isOpen()) {
			return false;
		}
		logger.warn("Circuit breaker open — rejecting dispatch", {
			topic: this._topic,
			service: this._serviceName,
			failureCount: this._failureCount,
		});
		return deliveryPort
			.markDeadLetter({
				message,
				reason: CircuitState.OPEN.toUpperCase(),
				deliveryAttempt: this._failureCount,
			})
			.then(() => true);
	}
}
