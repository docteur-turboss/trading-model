/**
 * Pure domain logic for DLQ business rules.
 * No MongoDB, no HTTP, no Redis — just decisions based on state.
 */

import { DLQ_STATUS } from "../dlq/dlq-status";

const DLQ_MAX_PASS_COUNT = 3;
const DLQ_MAX_CONSECUTIVE_ERRORS = 3;

export interface DlqDecisionInput {
	messageId: string;
	dlqPassCount: number;
	retryCount: number;
	consecutiveErrors: number;
	totalEntries: number;
	maxEntries: number;
	maxRetryAttempts: number;
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

function _isPingPongAbandon(dlqPassCount: number): boolean {
	return dlqPassCount >= DLQ_MAX_PASS_COUNT;
}

function _isRetryable(input: DlqDecisionInput): boolean {
	return (
		input.retryCount < input.maxRetryAttempts &&
		input.consecutiveErrors < DLQ_MAX_CONSECUTIVE_ERRORS
	);
}

function _shouldAbandon(input: DlqDecisionInput): boolean {
	return (
		input.retryCount >= input.maxRetryAttempts ||
		input.consecutiveErrors >= DLQ_MAX_CONSECUTIVE_ERRORS
	);
}

function _pingPongReason(
	pingPongAbandon: boolean,
	dlqPassCount: number
): string | undefined {
	if (!pingPongAbandon) {
		return;
	}
	return `Ping-pong detected: message entered DLQ ${dlqPassCount} times`;
}

/**
 * Encapsulates all DLQ business rules independently of storage.
 */
export class DlqDecisionService {
	evaluate(input: DlqDecisionInput): DlqEntryDecision {
		const pingPongAbandon = _isPingPongAbandon(input.dlqPassCount);
		const isRetryable = _isRetryable(input);
		const shouldAbandon = _shouldAbandon(input);
		const isAtCapacity = input.totalEntries >= input.maxEntries;

		return {
			pingPongAbandon,
			pingPongReason: _pingPongReason(pingPongAbandon, input.dlqPassCount),
			isRetryable,
			shouldAbandon,
			isAtCapacity,
		};
	}

	/** Determines the filter for claiming retryable entries. */
	buildClaimFilter(): {
		retryCountMax: number;
		consecutiveErrorsMax: number;
		excludedStatuses: string[];
	} {
		return {
			retryCountMax: this._maxRetryAttempts(),
			consecutiveErrorsMax: DLQ_MAX_CONSECUTIVE_ERRORS,
			excludedStatuses: [DLQ_STATUS.COMPLETED, DLQ_STATUS.ABANDONED],
		};
	}

	private _maxRetryAttempts(): number {
		// ENV.DLQ_RETRY_MAX_ATTEMPTS — provided by caller via input
		return Number.MAX_SAFE_INTEGER; // Overridden by input value
	}
}
