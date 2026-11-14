import { describe, expect, it } from "@jest/globals";
import { Percentage } from "../../../src/primitives/percentage";

describe("Percentage", () => {
	it("should create a valid percentage", () => {
		expect(Percentage.of(0.5)).toBe(0.5);
	});

	it("should throw for non-finite values", () => {
		expect(() => Percentage.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => Percentage.of(Number.NaN)).toThrow(RangeError);
	});

	it("should return zero", () => {
		expect(Percentage.zero()).toBe(0);
	});
});
