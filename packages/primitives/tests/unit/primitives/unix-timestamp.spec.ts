import { describe, expect, it } from "@jest/globals";
import { UnixTimestamp } from "../../../src/primitives/unix-timestamp";

describe("UnixTimestamp", () => {
	it("should create a valid timestamp", () => {
		expect(UnixTimestamp.of(1000)).toBe(1000);
		expect(UnixTimestamp.of(0)).toBe(0);
	});

	it("should throw for negative values", () => {
		expect(() => UnixTimestamp.of(-1)).toThrow(RangeError);
	});

	it("should throw for non-finite values", () => {
		expect(() => UnixTimestamp.of(Number.POSITIVE_INFINITY)).toThrow(
			RangeError
		);
		expect(() => UnixTimestamp.of(Number.NaN)).toThrow(RangeError);
	});

	it("should return current time", () => {
		const now = Date.now();
		const ts = UnixTimestamp.now();
		expect(ts).toBeGreaterThanOrEqual(now);
	});

	it("should add milliseconds", () => {
		expect(UnixTimestamp.add(100 as never, 50)).toBe(150);
	});
});
