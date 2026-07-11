import { describe, expect, it } from "@jest/globals";
import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import { deadLetterError } from "@trading-model/common/utils/errors";
import { classifyDeliveryFailure } from "../../../../src/messaging/core/delivery-decision";

describe("delivery-decision extras", () => {
	it("should dead-letter on DEAD_LETTER_ERROR", () => {
		const decision = classifyDeliveryFailure({
			error: deadLetterError("nack", {
				reason: "Subscriber rejected",
			}),
			deliveryMode: DeliveryMode.AtLeastOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		});
		expect(decision.retry).toBe(false);
		expect(decision.deadLetterReason).toBe("Subscriber rejected");
	});

	it("should use default reason when DEAD_LETTER_ERROR has no reason", () => {
		const decision = classifyDeliveryFailure({
			error: deadLetterError("nack"),
			deliveryMode: DeliveryMode.AtLeastOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		});
		expect(decision.retry).toBe(false);
		expect(decision.deadLetterReason).toBe("DEAD_LETTER");
	});
});
