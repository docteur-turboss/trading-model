import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import { isDeadLetterError } from "@trading-model/common/utils/errors";

export type ErrorAction =
	| { action: "dlq"; reason: string }
	| { action: "swallow" }
	| { action: "retry" };

export class DeliveryErrorClassifier {
	classify(
		err: unknown,
		deliveryAttempt: number,
		ttl: number,
		emittedAt: number,
		deliveryMode: DeliveryMode
	): ErrorAction {
		if (isDeadLetterError(err)) {
			const reason: string = err.reason ?? "NO_REASON";
			return { action: "dlq", reason };
		}

		if (this._isExpired(ttl, emittedAt)) {
			return { action: "dlq", reason: "TTL_EXPIRED" };
		}

		if (deliveryMode === DeliveryMode.AtMostOnce) {
			return { action: "swallow" };
		}

		if (deliveryAttempt >= MAX_RETRIES) {
			return { action: "dlq", reason: "MAX_RETRIES_EXCEEDED" };
		}

		return { action: "retry" };
	}

	private _isExpired(ttl: number, emittedAt: number): boolean {
		if (ttl <= 0 || emittedAt <= 0) {
			return false;
		}
		return emittedAt + ttl < Date.now();
	}
}

const MAX_RETRIES = 10;
