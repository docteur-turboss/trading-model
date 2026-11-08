import { describe, expect, it } from "@jest/globals";
import { NonNegativeInt } from "../../../src/primitives/non-negative-int";

describe("NonNegativeInt", () => {
	it("should accept zero and positive integers", () => {
		expect(NonNegativeInt.of(0)).toBe(0);
		expect(NonNegativeInt.of(308)).toBe(308);
	});

	it("should throw for negative or non-integer values", () => {
		expect(() => NonNegativeInt.of(-1)).toThrow(RangeError);
		expect(() => NonNegativeInt.of(1.5)).toThrow(RangeError);
	});
});
