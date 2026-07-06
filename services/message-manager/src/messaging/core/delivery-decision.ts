import {
	DeliveryMode,
	type DeliveryModeEnum,
} from "@trading-model/common/config/delivery-mode.types";
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
	deliveryMode: DeliveryModeEnum;
	deliveryAttempt: number;
	maxRetries: number;
}

export function classifyDeliveryFailure({
	error,
	deliveryMode,
	deliveryAttempt,
	maxRetries,
}: DeliveryFailureInput): DeliveryDecision {
	// DEAD_LETTER from subscriber
	if (error instanceof DeadLetterError) {
		return { retry: false, deadLetterReason: error.reason ?? "DEAD_LETTER" };
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
	if (
		deliveryMode === DeliveryMode.AT_MOST_ONCE ||
		deliveryMode === DeliveryMode.EXACTLY_ONCE
	) {
		return { retry: false, deadLetterReason: "AT_MOST_ONCE" };
	}

	// Max retries exceeded
	if (deliveryAttempt >= maxRetries) {
		return { retry: false, deadLetterReason: "MAX_RETRIES" };
	}

	return { retry: true };
}
