import { describe, expect, it } from "@jest/globals";

jest.mock("@trading-model/common/config/delivery-mode.types", () => ({
	DeliveryMode: {
		AT_MOST_ONCE: "at_most_once",
		AT_LEAST_ONCE: "at_least_once",
		EXACTLY_ONCE: "exactly_once",
	},
}));

jest.mock("@trading-model/common/utils/errors", () => ({
	ErrorCodes: { DEAD_LETTER_ERROR: "DEAD_LETTER" },
}));

import { classifyDeliveryFailure } from "../../../../src/messaging/core/delivery-decision";

describe("delivery-decision", () => {
	const atLeastOnce = "at_least_once";
	const atMostOnce = "at_most_once";
	const exactlyOnce = "exactly_once";

	it("should return dead letter for DEAD_LETTER_ERROR code", () => {
		const result = classifyDeliveryFailure({
			error: { name: "Error", message: "", code: "DEAD_LETTER", reason: "bad data" },
			deliveryMode: atLeastOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		});
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("bad data");
	});

	it("should return dead letter for 4xx errors (excluding 429)", () => {
		const result = classifyDeliveryFailure({
			error: { name: "Error", message: "", statusCode: 400 },
			deliveryMode: atLeastOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		});
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("FATAL_400");
	});

	it("should not treat 429 as fatal", () => {
		const result = classifyDeliveryFailure({
			error: { name: "Error", message: "", statusCode: 429 },
			deliveryMode: atLeastOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		});
		expect(result.retry).toBe(true);
	});

	it("should return dead letter for at-most-once delivery", () => {
		const result = classifyDeliveryFailure({
			error: { name: "Error", message: "" },
			deliveryMode: atMostOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		});
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("AT_MOST_ONCE");
	});

	it("should return dead letter for exactly-once delivery", () => {
		const result = classifyDeliveryFailure({
			error: { name: "Error", message: "" },
			deliveryMode: exactlyOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		});
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("AT_MOST_ONCE");
	});

	it("should return dead letter when max retries exceeded", () => {
		const result = classifyDeliveryFailure({
			error: { name: "Error", message: "" },
			deliveryMode: atLeastOnce,
			deliveryAttempt: 3,
			maxRetries: 3,
		});
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("MAX_RETRIES");
	});

	it("should return retry when within limits", () => {
		const result = classifyDeliveryFailure({
			error: { name: "Error", message: "timeout" },
			deliveryMode: atLeastOnce,
			deliveryAttempt: 1,
			maxRetries: 3,
		});
		expect(result.retry).toBe(true);
	});
});
