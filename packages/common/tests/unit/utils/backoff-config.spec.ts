import { describe, expect, it } from "@jest/globals";
import {
	type DurationMs,
	DurationMs as Ms,
} from "@trading-model/primitives/primitives/time-ids";
import {
	computeExponentialBackoff,
	computeExponentialBackoffWithJitter,
} from "../../../src/utils/backoff-config";

const range = { baseDelayMs: Ms.of(100), maxDelayMs: Ms.of(500) };

describe("computeExponentialBackoff", () => {
	it("doubles from the base delay and caps at the max delay", () => {
		expect(
			[0, 1, 2, 3, 10].map((a) => computeExponentialBackoff(a, range))
		).toEqual([100, 200, 400, 500, 500]);
	});

	it("defaults to 200 ms base and 5 s max", () => {
		expect(computeExponentialBackoff(0, {})).toBe(200);
		expect(computeExponentialBackoff(10, {})).toBe(5000);
	});

	it("rejects a base delay <= 0 or above the max delay", () => {
		expect(() =>
			computeExponentialBackoff(0, { baseDelayMs: 0 as DurationMs })
		).toThrow(RangeError);
		expect(() =>
			computeExponentialBackoff(0, {
				baseDelayMs: Ms.of(200),
				maxDelayMs: Ms.of(100),
			})
		).toThrow(RangeError);
	});
});

describe("computeExponentialBackoffWithJitter", () => {
	it("jitters by default within +-20 % and never above maxDelayMs", () => {
		const delays = new Set<number>();
		for (let i = 0; i < 50; i++) {
			const delay = computeExponentialBackoffWithJitter(1, range);
			expect(delay).toBeGreaterThanOrEqual(160);
			expect(delay).toBeLessThan(240);
			delays.add(delay);
			expect(
				computeExponentialBackoffWithJitter(10, range)
			).toBeLessThanOrEqual(500);
		}
		expect(delays.size).toBeGreaterThan(1);
	});
});
