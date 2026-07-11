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

export interface DlqDecisionInputParams {
	messageId: MessageId;
	dlqPassCount: number;
	retryCount: number;
	consecutiveErrors: number;
	totalEntries: number;
	maxEntries: PositiveInt;
	maxRetryAttempts: PositiveInt;
}

export class DlqDecisionInput {
	readonly messageId: MessageId;
	readonly dlqPassCount: number;
	readonly retryCount: number;
	readonly consecutiveErrors: number;
	readonly totalEntries: number;
	readonly maxEntries: PositiveInt;
	readonly maxRetryAttempts: PositiveInt;

	constructor(params: DlqDecisionInputParams) {
		this.messageId = params.messageId;
		this.dlqPassCount = params.dlqPassCount;
		this.retryCount = params.retryCount;
		this.consecutiveErrors = params.consecutiveErrors;
		this.totalEntries = params.totalEntries;
		this.maxEntries = params.maxEntries;
		this.maxRetryAttempts = params.maxRetryAttempts;
	}

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
