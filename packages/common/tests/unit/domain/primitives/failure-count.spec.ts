import { describe, expect, it } from "@jest/globals";
import { FailureCount } from "../../../../src/domain/primitives/failure-count";

describe("FailureCount", () => {
	it("should create a valid failure count", () => {
		expect(FailureCount.of(0)).toBe(0);
		expect(FailureCount.of(42)).toBe(42);
	});

	it("should throw for negative values", () => {
		expect(() => FailureCount.of(-1)).toThrow(RangeError);
	});

	it("should throw for non-integer values", () => {
		expect(() => FailureCount.of(1.5)).toThrow(RangeError);
	});

	it("should throw for non-finite values", () => {
		expect(() => FailureCount.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
	});

	it("should return zero", () => {
		expect(FailureCount.zero()).toBe(0);
	});

	it("should convert to number", () => {
		expect(FailureCount.toNumber(7 as never)).toBe(7);
	});
});
