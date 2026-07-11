import { describe, expect, it } from "@jest/globals";

import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";

import { deadLetterError } from "@trading-model/common/utils/errors";
import { classifyDeliveryFailure } from "../../../../src/messaging/core/delivery-decision";

describe("delivery-decision", () => {
	it("should return dead letter for DEAD_LETTER_ERROR code", () => {
		const result = classifyDeliveryFailure({
			error: deadLetterError("bad data", { reason: "bad data" }),
			deliveryMode: DeliveryMode.AtLeastOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		});
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("bad data");
	});

	it("should return dead letter for 4xx errors (excluding 429)", () => {
		const result = classifyDeliveryFailure({
			error: { name: "Error", message: "", statusCode: 400 },
			deliveryMode: DeliveryMode.AtLeastOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		} as never);
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("FATAL_400");
	});

	it("should not treat 429 as fatal", () => {
		const result = classifyDeliveryFailure({
			error: { name: "Error", message: "", statusCode: 429 },
			deliveryMode: DeliveryMode.AtLeastOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		} as never);
		expect(result.retry).toBe(true);
	});

	it("should return dead letter for at-most-once delivery", () => {
		const result = classifyDeliveryFailure({
			error: { name: "Error", message: "" },
			deliveryMode: DeliveryMode.AtMostOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		} as never);
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("AT_MOST_ONCE");
	});

	it("should return dead letter for exactly-once delivery", () => {
		const result = classifyDeliveryFailure({
			error: { name: "Error", message: "" },
			deliveryMode: DeliveryMode.ExactlyOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		} as never);
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("AT_MOST_ONCE");
	});

	it("should return dead letter when max retries exceeded", () => {
		const result = classifyDeliveryFailure({
			error: { name: "Error", message: "" },
			deliveryMode: DeliveryMode.AtLeastOnce,
			deliveryAttempt: 3,
			maxRetries: 3,
		} as never);
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("MAX_RETRIES");
	});

	it("should return retry when within limits", () => {
		const result = classifyDeliveryFailure({
			error: { name: "Error", message: "timeout" },
			deliveryMode: DeliveryMode.AtLeastOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		} as never);
		expect(result.retry).toBe(true);
	});
});
