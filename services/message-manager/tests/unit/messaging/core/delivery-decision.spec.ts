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
		const result = classifyDeliveryFailure(
			{ name: "Error", message: "", code: "DEAD_LETTER", reason: "bad data" },
			atLeastOnce,
			1,
			3
		);
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("bad data");
	});

	it("should return dead letter for 4xx errors (excluding 429)", () => {
		const result = classifyDeliveryFailure(
			{ name: "Error", message: "", statusCode: 400 },
			atLeastOnce,
			1,
			3
		);
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("FATAL_400");
	});

	it("should not treat 429 as fatal", () => {
		const result = classifyDeliveryFailure(
			{ name: "Error", message: "", statusCode: 429 },
			atLeastOnce,
			1,
			3
		);
		expect(result.retry).toBe(true);
	});

	it("should return dead letter for at-most-once delivery", () => {
		const result = classifyDeliveryFailure(
			{ name: "Error", message: "" },
			atMostOnce,
			1,
			3
		);
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("AT_MOST_ONCE");
	});

	it("should return dead letter for exactly-once delivery", () => {
		const result = classifyDeliveryFailure(
			{ name: "Error", message: "" },
			exactlyOnce,
			1,
			3
		);
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("AT_MOST_ONCE");
	});

	it("should return dead letter when max retries exceeded", () => {
		const result = classifyDeliveryFailure(
			{ name: "Error", message: "" },
			atLeastOnce,
			3,
			3
		);
		expect(result.retry).toBe(false);
		expect(result.deadLetterReason).toBe("MAX_RETRIES");
	});

	it("should return retry when within limits", () => {
		const result = classifyDeliveryFailure(
			{ name: "Error", message: "timeout" },
			atLeastOnce,
			1,
			3
		);
		expect(result.retry).toBe(true);
	});
});
