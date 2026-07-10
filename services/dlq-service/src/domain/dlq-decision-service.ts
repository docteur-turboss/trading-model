/**
 * Pure domain logic for DLQ business rules.
 * No MongoDB, no HTTP, no Redis — just decisions based on state.
 */

import {
	DLQ_MAX_CONSECUTIVE_ERRORS,
	DLQ_MAX_PASS_COUNT,
} from "../dlq/dlq-constants";
import { DlqStatus } from "../dlq/dlq-status";

export class DlqDecisionInput {
	constructor(
		readonly messageId: string,
		readonly dlqPassCount: number,
		readonly retryCount: number,
		readonly consecutiveErrors: number,
		readonly totalEntries: number,
		readonly maxEntries: number,
		readonly maxRetryAttempts: number
	) {}

	isPingPongAbandon(): boolean {
		return this.dlqPassCount >= DLQ_MAX_PASS_COUNT;
	}

	isRetryable(): boolean {
		return (
			this.retryCount < this.maxRetryAttempts &&
			this.consecutiveErrors < DLQ_MAX_CONSECUTIVE_ERRORS
		);
	}

	shouldAbandon(): boolean {
		return (
			this.retryCount >= this.maxRetryAttempts ||
			this.consecutiveErrors >= DLQ_MAX_CONSECUTIVE_ERRORS
		);
	}

	isAtCapacity(): boolean {
		return this.totalEntries >= this.maxEntries;
	}

	pingPongReason(): string | undefined {
		if (!this.isPingPongAbandon()) {
			return;
		}
		return `Ping-pong detected: message entered DLQ ${this.dlqPassCount} times`;
	}
}

export interface DlqEntryDecision {
	/** Whether this message should be immediately abandoned (ping-pong detection). */
	pingPongAbandon: boolean;
	/** Reason for ping-pong abandon, if applicable. */
	pingPongReason?: string;
	/** Whether the message is still eligible for retry. */
	isRetryable: boolean;
	/** Whether the message should be abandoned (retries exhausted or consecutive errors). */
	shouldAbandon: boolean;
	/** Whether the DLQ has reached capacity. */
	isAtCapacity: boolean;
}

/**
 * Encapsulates all DLQ business rules independently of storage.
 */
export class DlqDecisionService {
	evaluate(input: DlqDecisionInput): DlqEntryDecision {
		const pingPongAbandon = input.isPingPongAbandon();
		const isRetryable = input.isRetryable();
		const shouldAbandon = input.shouldAbandon();
		const isAtCapacity = input.isAtCapacity();

		return {
			pingPongAbandon,
			pingPongReason: input.pingPongReason(),
			isRetryable,
			shouldAbandon,
			isAtCapacity,
		};
	}

	buildClaimFilter(): {
		retryCountMax: number;
		consecutiveErrorsMax: number;
		excludedStatuses: string[];
	} {
		return {
			retryCountMax: this._maxRetryAttempts(),
			consecutiveErrorsMax: DLQ_MAX_CONSECUTIVE_ERRORS,
			excludedStatuses: [DlqStatus.Completed, DlqStatus.Abandoned],
		};
	}

	private _maxRetryAttempts(): number {
		return Number.MAX_SAFE_INTEGER;
	}
}
