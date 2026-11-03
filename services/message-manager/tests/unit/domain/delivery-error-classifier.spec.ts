import { describe, expect, it } from "@jest/globals";
import { deadLetterError } from "@trading-model/common/utils/errors";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import {
	DurationMs,
	type SequenceNumber,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import {
	DeliveryErrorClassifier,
	DlqReason,
	ErrorActionType,
	isDeliveryExhausted,
	MAX_RETRIES,
} from "../../../src/domain/delivery-error-classifier";

const classifier = new DeliveryErrorClassifier();
const transient = new Error("Transient error");

function params(deliveryMode: DeliveryMode) {
	return {
		deliveryMode,
		ttl: DurationMs.of(60_000),
		emittedAt: UnixTimestamp.now(),
	};
}

describe("DeliveryErrorClassifier", () => {
	it("should dead-letter a DeadLetterError at once with its reason", () => {
		expect(
			classifier.classify(
				deadLetterError("rejected", {
					reason: DlqReason.RejectedBySubscriber,
				}),
				1 as SequenceNumber,
				params(DeliveryMode.AtLeastOnce)
			)
		).toEqual({
			action: ErrorActionType.DLQ,
			reason: DlqReason.RejectedBySubscriber,
		});
	});

	it("should retry an at-least-once failure below the retry budget", () => {
		expect(
			classifier.classify(
				transient,
				1 as SequenceNumber,
				params(DeliveryMode.AtLeastOnce)
			)
		).toEqual({ action: ErrorActionType.RETRY });
	});

	it("should dead-letter an at-least-once failure once the budget is spent", () => {
		expect(
			classifier.classify(
				transient,
				MAX_RETRIES as unknown as SequenceNumber,
				params(DeliveryMode.AtLeastOnce)
			)
		).toEqual({
			action: ErrorActionType.DLQ,
			reason: DlqReason.MaxRetriesExceeded,
		});
	});

	it("should swallow an at-most-once failure", () => {
		expect(
			classifier.classify(
				transient,
				1 as SequenceNumber,
				params(DeliveryMode.AtMostOnce)
			)
		).toEqual({ action: ErrorActionType.SWALLOW });
	});

	// A retry could deliver it twice; a silent drop would lose it.
	it("should dead-letter an exactly-once failure without retrying", () => {
		expect(
			classifier.classify(
				transient,
				1 as SequenceNumber,
				params(DeliveryMode.ExactlyOnce)
			)
		).toEqual({
			action: ErrorActionType.DLQ,
			reason: DlqReason.SingleAttemptFailed,
		});
	});
});

describe("isDeliveryExhausted", () => {
	it("should hold for failures that used up the allowed attempts only", () => {
		expect(isDeliveryExhausted(DlqReason.MaxRetriesExceeded)).toBe(true);
		expect(isDeliveryExhausted(DlqReason.SingleAttemptFailed)).toBe(true);
		expect(isDeliveryExhausted(DlqReason.TtlExpired)).toBe(false);
		expect(isDeliveryExhausted(DlqReason.RejectedBySubscriber)).toBe(false);
	});
});
