import type { Message } from "@trading-model/common/contracts/message.types";
import { CircuitState } from "@trading-model/common/domain/circuit-state";
import type { IUnkeyedCircuitBreaker } from "@trading-model/common/reliability/circuit-breaker.interface";
import { logger } from "../../config/logger";
import type { MessageDeliveryPort } from "./message-delivery-port";

export interface DeliveryCircuitBreakerConfig {
	failureThreshold?: number;
}

/**
 * Tracks consecutive delivery failures and opens the circuit when the
 * threshold is reached, preventing cascading failures and routing
 * subsequent messages directly to the DLQ.
 */
export class DeliveryCircuitBreaker implements IUnkeyedCircuitBreaker {
	private _failureCount = 0;
	private readonly _threshold: number;

	constructor(
		private readonly _topic: string,
		private readonly _serviceName: string,
		config?: DeliveryCircuitBreakerConfig,
	) {
		this._threshold = config?.failureThreshold ?? 5;
	}

	clear(): void {
		this._failureCount = 0;
	}

	recordFailure(count?: number, threshold?: number): void {
		this._failureCount += count ?? 1;
	}

	recordSuccess(): void {
		this.clear();
	}

	isOpen(): boolean {
		return this._failureCount >= this._threshold;
	}

	isAllowed(): boolean {
		return !this.isOpen();
	}

	getState(): CircuitState {
		return this.isOpen() ? CircuitState.OPEN : CircuitState.CLOSED;
	}

	getFailureCount(): number {
		return this._failureCount;
	}

	check(): CircuitState {
		return this.isOpen() ? CircuitState.OPEN : CircuitState.CLOSED;
	}

	async call<TResult>(
		fn: () => Promise<TResult>,
		fallback?: () => TResult
	): Promise<TResult> {
		if (!this.isAllowed()) {
			if (fallback) {
				return Promise.resolve(fallback());
			}
			throw new Error(`Circuit breaker is open for topic: ${this._topic}`);
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

	/**
	 * Checks whether the circuit is open. If so, logs a warning and routes
	 * the message to the DLQ without attempting delivery.
	 *
	 * @returns `true` when the circuit is open (caller should skip delivery).
	 */
	checkDelivery<TData>(
		message: Message<TData>,
		deliveryPort: MessageDeliveryPort
	): Promise<boolean> {
		if (!this.isOpen()) {
			return Promise.resolve(false);
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
