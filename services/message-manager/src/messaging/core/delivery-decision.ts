import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import { isNonRetryableClientError } from "@trading-model/common/config/http-retry";
import type {
	PositiveInt,
	SequenceNumber,
} from "@trading-model/common/domain/primitives";
import { isDeadLetterError } from "@trading-model/common/utils/errors";

interface DeliveryDecision {
	retry: boolean;
	deadLetterReason?: string;
}

/**
 * Pure function: classifies a delivery failure into retry or dead-letter.
 * No side effects — only decision logic.
 */
export interface DeliveryFailureInput {
	error: Error & { statusCode?: number; reason?: string };
	deliveryMode: DeliveryMode;
	deliveryAttempt: SequenceNumber;
	maxRetries: PositiveInt;
}

export function classifyDeliveryFailure({
	error,
	deliveryMode,
	deliveryAttempt,
	maxRetries,
}: DeliveryFailureInput): DeliveryDecision {
	return (
		checkDeadLetter(error) ??
		checkFatalClientError(error) ??
		checkAtMostOnce(deliveryMode) ??
		checkMaxRetries(deliveryAttempt, maxRetries) ?? { retry: true }
	);
}

function checkDeadLetter(
	error: Error & { statusCode?: number; reason?: string }
): DeliveryDecision | null {
	if (isDeadLetterError(error)) {
		return {
			retry: false,
			deadLetterReason: error.reason ?? "DEAD_LETTER",
		};
	}
	return null;
}

function checkFatalClientError(
	error: Error & { statusCode?: number; reason?: string }
): DeliveryDecision | null {
	if (
		error.statusCode !== undefined &&
		isNonRetryableClientError(error.statusCode)
	) {
		return { retry: false, deadLetterReason: `FATAL_${error.statusCode}` };
	}
	return null;
}

function checkAtMostOnce(deliveryMode: DeliveryMode): DeliveryDecision | null {
	if (
		deliveryMode === DeliveryMode.AtMostOnce ||
		deliveryMode === DeliveryMode.ExactlyOnce
	) {
		return { retry: false, deadLetterReason: "AT_MOST_ONCE" };
	}
	return null;
}

function checkMaxRetries(
	deliveryAttempt: SequenceNumber,
	maxRetries: SequenceNumber | PositiveInt
): DeliveryDecision | null {
	if (deliveryAttempt >= maxRetries) {
		return { retry: false, deadLetterReason: "MAX_RETRIES" };
	}
	return null;
}
