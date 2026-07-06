import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { DeliveryMode as DeliveryModeType } from "@trading-model/common/config/delivery-mode.types";
import { DeadLetterError } from "@trading-model/common/utils/errors";

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
	deliveryAttempt: number;
	maxRetries: number;
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

function checkDeadLetter(error: Error & { statusCode?: number; reason?: string }): DeliveryDecision | null {
	if (error instanceof DeadLetterError) {
		return { retry: false, deadLetterReason: error.reason ?? "DEAD_LETTER" };
	}
	return null;
}

function checkFatalClientError(error: Error & { statusCode?: number; reason?: string }): DeliveryDecision | null {
	if (
		error.statusCode !== undefined &&
		error.statusCode >= 400 &&
		error.statusCode < 500 &&
		error.statusCode !== 429
	) {
		return { retry: false, deadLetterReason: `FATAL_${error.statusCode}` };
	}
	return null;
}

function checkAtMostOnce(deliveryMode: DeliveryMode): DeliveryDecision | null {
	if (
		deliveryMode === DeliveryMode.AT_MOST_ONCE ||
		deliveryMode === DeliveryMode.EXACTLY_ONCE
	) {
		return { retry: false, deadLetterReason: "AT_MOST_ONCE" };
	}
	return null;
}

function checkMaxRetries(deliveryAttempt: number, maxRetries: number): DeliveryDecision | null {
	if (deliveryAttempt >= maxRetries) {
		return { retry: false, deadLetterReason: "MAX_RETRIES" };
	}
	return null;
}
