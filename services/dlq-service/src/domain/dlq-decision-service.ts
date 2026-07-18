/**
 * Pure domain logic for DLQ business rules.
 * No MongoDB, no HTTP, no Redis — just decisions based on state.
 */

import type {
	MessageId,
	PositiveInt,
} from "@trading-model/common/domain/primitives";
import {
	DLQ_MAX_CONSECUTIVE_ERRORS,
	DLQ_MAX_PASS_COUNT,
} from "../dlq/dlq-constants";
import { DlqStatus } from "../dlq/dlq-status";

export interface DlqDecisionInput {
	messageId: MessageId;
	dlqPassCount: number;
	retryCount: number;
	consecutiveErrors: number;
	totalEntries: number;
	maxEntries: PositiveInt;
	maxRetryAttempts: PositiveInt;
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
		const pingPongAbandon = input.dlqPassCount >= DLQ_MAX_PASS_COUNT;
		const isRetryable =
			input.retryCount < input.maxRetryAttempts &&
			input.consecutiveErrors < DLQ_MAX_CONSECUTIVE_ERRORS;
		const shouldAbandon =
			input.retryCount >= input.maxRetryAttempts ||
			input.consecutiveErrors >= DLQ_MAX_CONSECUTIVE_ERRORS;
		const isAtCapacity = input.totalEntries >= input.maxEntries;

		return {
			pingPongAbandon,
			pingPongReason: pingPongAbandon
				? `Ping-pong detected: message entered DLQ ${input.dlqPassCount} times`
				: undefined,
			isRetryable,
			shouldAbandon,
			isAtCapacity,
		};
	}

	buildClaimFilter(): {
		retryCountMax: PositiveInt;
		consecutiveErrorsMax: PositiveInt;
		excludedStatuses: DlqStatus[];
	} {
		return {
			retryCountMax: this._maxRetryAttempts(),
			consecutiveErrorsMax: DLQ_MAX_CONSECUTIVE_ERRORS as PositiveInt,
			excludedStatuses: [DlqStatus.Completed, DlqStatus.Abandoned],
		};
	}

	private _maxRetryAttempts(): PositiveInt {
		return Number.MAX_SAFE_INTEGER as PositiveInt;
	}
}
