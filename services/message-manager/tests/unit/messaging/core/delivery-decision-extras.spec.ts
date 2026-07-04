import { describe, expect, it } from "@jest/globals";
import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import { ErrorCodes } from "@trading-model/common/utils/errors";
import { classifyDeliveryFailure } from "../../../../src/messaging/core/delivery-decision";

describe("delivery-decision extras", () => {
	it("should dead-letter on DEAD_LETTER_ERROR", () => {
		const decision = classifyDeliveryFailure(
			{
				code: ErrorCodes.DEAD_LETTER_ERROR,
				statusCode: 400,
				message: "nack",
				reason: "Subscriber rejected",
			} as never,
			DeliveryMode.AT_LEAST_ONCE,
			1,
			3
		);
		expect(decision.retry).toBe(false);
		expect(decision.deadLetterReason).toBe("Subscriber rejected");
	});

	it("should use default reason when DEAD_LETTER_ERROR has no reason", () => {
		const decision = classifyDeliveryFailure(
			{
				code: ErrorCodes.DEAD_LETTER_ERROR,
				statusCode: 400,
				message: "nack",
			} as never,
			DeliveryMode.AT_LEAST_ONCE,
			1,
			3
		);
		expect(decision.retry).toBe(false);
		expect(decision.deadLetterReason).toBe("DEAD_LETTER");
	});
});
