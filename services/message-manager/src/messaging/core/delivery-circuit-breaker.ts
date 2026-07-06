import type { CircuitState } from "@trading-model/common/domain/circuit-state";
import type { Message } from "@trading-model/common/contracts/message.types";
import type { MessageDeliveryPort } from "./message-delivery-port";
import { logger } from "../../config/logger";

const CIRCUIT_BREAKER_THRESHOLD = 5;

/**
 * Tracks consecutive delivery failures and opens the circuit when the
 * threshold is reached, preventing cascading failures and routing
 * subsequent messages directly to the DLQ.
 */
export class DeliveryCircuitBreaker {
	private _failureCount = 0;

	constructor(
		private readonly _topic: string,
		private readonly _serviceName: string
	) {}

	recordFailure(): void {
		this._failureCount++;
	}

	recordSuccess(): void {
		this.reset();
	}

	isOpen(): boolean {
		return this._failureCount >= CIRCUIT_BREAKER_THRESHOLD;
	}

	isAllowed(): boolean {
		return !this.isOpen();
	}

	getState(): CircuitState {
		return this.isOpen() ? "open" : "closed";
	}

	getFailureCount(): number {
		return this._failureCount;
	}

	reset(): void {
		this._failureCount = 0;
	}

	/**
	 * Checks whether the circuit is open. If so, logs a warning and routes
	 * the message to the DLQ without attempting delivery.
	 *
	 * @returns `true` when the circuit is open (caller should skip delivery).
	 */
	async check<TData>(
		message: Message<TData>,
		deliveryPort: MessageDeliveryPort
	): Promise<boolean> {
		if (!this.isOpen()) {
			return false;
		}
		logger.warn("Circuit breaker open — rejecting dispatch", {
			topic: this._topic,
			service: this._serviceName,
			failureCount: this._failureCount,
		});
		await deliveryPort.markDeadLetter({
			message,
			reason: "CIRCUIT_OPEN",
			deliveryAttempt: this._failureCount,
		});
		return true;
	}
}
