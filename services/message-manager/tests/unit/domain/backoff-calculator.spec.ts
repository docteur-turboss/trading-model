import { describe, expect, it } from "@jest/globals";
import type { SequenceNumber } from "@trading-model/primitives/primitives";
import {
	backoffDelay,
	DELIVERY_ATTEMPT_TIMEOUT_MS,
	retryDueMs,
} from "../../../src/domain/backoff-calculator";

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

describe("retryDueMs", () => {
	// A replica must not start an attempt while another one may still be in flight.
	it("should wait for the previous attempt to time out, then for the backoff", () => {
		for (let deliveries = 1; deliveries <= 10; deliveries++) {
			const due = retryDueMs(deliveries);
			expect(due).toBeGreaterThanOrEqual(DELIVERY_ATTEMPT_TIMEOUT_MS);
			expect(due).toBeLessThanOrEqual(DELIVERY_ATTEMPT_TIMEOUT_MS + 24_000);
		}
	});
});
