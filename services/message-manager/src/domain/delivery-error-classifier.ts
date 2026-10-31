import { isDeadLetterError } from "@trading-model/common/utils/errors";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import type {
	DurationMs,
	PositiveInt,
	SequenceNumber,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type { DeliveryParams } from "./delivery-params";

export enum DlqReason {
	NoReason = "NO_REASON",
	TtlExpired = "TTL_EXPIRED",
	MaxRetriesExceeded = "MAX_RETRIES_EXCEEDED",
	SingleAttemptFailed = "SINGLE_ATTEMPT_FAILED",
	/** The subscriber refused the message itself: no retry can succeed. */
	RejectedBySubscriber = "REJECTED_BY_SUBSCRIBER",
}

/** Reasons meaning the subscriber failed every delivery attempt it was allowed. */
export function isDeliveryExhausted(reason: string): boolean {
	return (
		reason === DlqReason.MaxRetriesExceeded ||
		reason === DlqReason.SingleAttemptFailed
	);
}

export enum ErrorActionType {
	DLQ = "dlq",
	SWALLOW = "swallow",
	RETRY = "retry",
}

export type ErrorAction =
	| { action: ErrorActionType.DLQ; reason: string }
	| { action: ErrorActionType.SWALLOW }
	| { action: ErrorActionType.RETRY };

export class DeliveryErrorClassifier {
	classify(
		err: unknown,
		deliveryAttempt: SequenceNumber,
		{ ttl, emittedAt, deliveryMode }: DeliveryParams
	): ErrorAction {
		if (isDeadLetterError(err)) {
			const reason = err.reason ?? DlqReason.NoReason;
			return { action: ErrorActionType.DLQ, reason };
		}

		if (this._isExpired(ttl, emittedAt)) {
			return { action: ErrorActionType.DLQ, reason: DlqReason.TtlExpired };
		}

		if (deliveryMode === DeliveryMode.AtMostOnce) {
			return { action: ErrorActionType.SWALLOW };
		}

		// No broker retry, so no duplicate; the failed message stays replayable.
		if (deliveryMode === DeliveryMode.ExactlyOnce) {
			return {
				action: ErrorActionType.DLQ,
				reason: DlqReason.SingleAttemptFailed,
			};
		}

		if (deliveryAttempt >= MAX_RETRIES) {
			return {
				action: ErrorActionType.DLQ,
				reason: DlqReason.MaxRetriesExceeded,
			};
		}

		return { action: ErrorActionType.RETRY };
	}

	private _isExpired(ttl: DurationMs, emittedAt: UnixTimestamp): boolean {
		if (ttl <= 0 || emittedAt <= 0) {
			return false;
		}
		return emittedAt + ttl < Date.now();
	}
}

/** Delivery attempts of an at-least-once message before it is dead-lettered. */
export const MAX_RETRIES = 10 as PositiveInt;
