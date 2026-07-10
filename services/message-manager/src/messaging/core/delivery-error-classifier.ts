import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import { isDeadLetterError } from "@trading-model/common/utils/errors";
import type { DeliveryParams } from "./delivery-params";

export enum DlqReason {
	NoReason = "NO_REASON",
	TtlExpired = "TTL_EXPIRED",
	MaxRetriesExceeded = "MAX_RETRIES_EXCEEDED",
}

export enum ErrorActionType {
	DLQ = "dlq",
	SWALLOW = "swallow",
	RETRY = "retry",
}

export type ErrorAction =
	| { action: ErrorActionType.DLQ; reason: DlqReason }
	| { action: ErrorActionType.SWALLOW }
	| { action: ErrorActionType.RETRY };

export class DeliveryErrorClassifier {
	classify(
		err: unknown,
		deliveryAttempt: number,
		{ ttl, emittedAt, deliveryMode }: DeliveryParams
	): ErrorAction {
		if (isDeadLetterError(err)) {
			const reason = (err.reason ?? DlqReason.NoReason) as DlqReason;
			return { action: ErrorActionType.DLQ, reason };
		}

		if (this._isExpired(ttl, emittedAt)) {
			return { action: ErrorActionType.DLQ, reason: DlqReason.TtlExpired };
		}

		if (deliveryMode === DeliveryMode.AtMostOnce) {
			return { action: ErrorActionType.SWALLOW };
		}

		if (deliveryAttempt >= MAX_RETRIES) {
			return { action: ErrorActionType.DLQ, reason: DlqReason.MaxRetriesExceeded };
		}

		return { action: ErrorActionType.RETRY };
	}

	private _isExpired(ttl: number, emittedAt: number): boolean {
		if (ttl <= 0 || emittedAt <= 0) {
			return false;
		}
		return emittedAt + ttl < Date.now();
	}
}

const MAX_RETRIES = 10;
