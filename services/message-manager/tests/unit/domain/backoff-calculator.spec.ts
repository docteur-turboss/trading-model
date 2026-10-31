import { describe, expect, it } from "@jest/globals";
import { PUBLISH_TIMEOUT_MS } from "@trading-model/contracts/publish-timeout";
import type { SequenceNumber } from "@trading-model/primitives/primitives";
import { DELIVERY_ATTEMPT_TIMEOUT_MS } from "../../../src/adapters/outbound/http-message-delivery";
import {
	backoffDelay,
	maxDeliveryDurationMs,
} from "../../../src/domain/backoff-calculator";
import { MAX_RETRIES } from "../../../src/domain/delivery-error-classifier";

describe("backoffDelay", () => {
	it("should double from 2s and stay within ±20% jitter", () => {
		for (let i = 0; i < 50; i++) {
			const delay = backoffDelay(1 as SequenceNumber);
			expect(delay).toBeGreaterThanOrEqual(1600);
			expect(delay).toBeLessThanOrEqual(2400);
		}
	});

	it("should cap the delay at 20s plus jitter", () => {
		for (let i = 0; i < 50; i++) {
			expect(backoffDelay(9 as SequenceNumber)).toBeLessThanOrEqual(24_000);
		}
	});
});

describe("maxDeliveryDurationMs", () => {
	it("should add every attempt timeout and every pause at maximum jitter", () => {
		// Pauses after attempts 1 and 2: 2s and 4s, each +20%.
		expect(maxDeliveryDurationMs(3, 1000)).toBe(3000 + 2400 + 4800);
	});

	// The publisher waits for the broker's answer: a retry budget longer than
	// the publish timeout cuts the request while delivery goes on.
	it("should fit the whole retry budget inside the publish timeout", () => {
		const budget = maxDeliveryDurationMs(
			MAX_RETRIES,
			DELIVERY_ATTEMPT_TIMEOUT_MS
		);
		expect(budget).toBeLessThan(PUBLISH_TIMEOUT_MS);
	});
});
