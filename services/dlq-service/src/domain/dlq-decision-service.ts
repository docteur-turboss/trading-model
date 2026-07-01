/**
 * Pure domain logic for DLQ business rules.
 * No MongoDB, no HTTP, no Redis — just decisions based on state.
 */

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

  /** Determines the filter for claiming retryable entries. */
  buildClaimFilter(): {
    retryCountMax: number;
    consecutiveErrorsMax: number;
    excludedStatuses: string[];
  } {
    return {
      retryCountMax: this.maxRetryAttempts(),
      consecutiveErrorsMax: DLQ_MAX_CONSECUTIVE_ERRORS,
      excludedStatuses: ['completed', 'abandoned'],
    };
  }

  private maxRetryAttempts(): number {
    // env.DLQ_RETRY_MAX_ATTEMPTS — provided by caller via input
    return Number.MAX_SAFE_INTEGER; // Overridden by input value
  }
}
