import { ErrorCodes } from '@trading-model/common/utils/errors';
import { DeliveryMode } from '../../../common/contracts/message.types';

interface DeliveryDecision {
  retry: boolean;
  deadLetterReason?: string;
}

/**
 * Pure function: classifies a delivery failure into retry or dead-letter.
 * No side effects — only decision logic.
 */
export function classifyDeliveryFailure(
  error: Error & { code?: string; statusCode?: number; reason?: string },
  deliveryMode: DeliveryMode,
  deliveryAttempt: number,
  maxRetries: number
): DeliveryDecision {
  // DEAD_LETTER from subscriber
  if (error.code === ErrorCodes.DEAD_LETTER_ERROR) {
    return { retry: false, deadLetterReason: error.reason ?? 'DEAD_LETTER' };
  }

  // Fatal client error (4xx except 429)
  if (
    error.statusCode !== undefined &&
    error.statusCode >= 400 &&
    error.statusCode < 500 &&
    error.statusCode !== 429
  ) {
    return { retry: false, deadLetterReason: `FATAL_${error.statusCode}` };
  }

  // At-most-once / exactly-once — no retry
  if (deliveryMode === DeliveryMode.AT_MOST_ONCE || deliveryMode === DeliveryMode.EXACTLY_ONCE) {
    return { retry: false, deadLetterReason: 'AT_MOST_ONCE' };
  }

  // Max retries exceeded
  if (deliveryAttempt >= maxRetries) {
    return { retry: false, deadLetterReason: 'MAX_RETRIES' };
  }

  return { retry: true };
}
