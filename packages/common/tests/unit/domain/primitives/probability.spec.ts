import { describe, expect, it } from "@jest/globals";
import { Probability } from "../../../../src/domain/primitives/probability";

describe("Probability", () => {
	it("should create a valid probability", () => {
		expect(Probability.of(0)).toBe(0);
		expect(Probability.of(0.5)).toBe(0.5);
		expect(Probability.of(1)).toBe(1);
	});

	it("should throw for negative values", () => {
		expect(() => Probability.of(-0.1)).toThrow(RangeError);
	});

	it("should throw for values > 1", () => {
		expect(() => Probability.of(1.1)).toThrow(RangeError);
	});

	it("should throw for non-finite values", () => {
		expect(() => Probability.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => Probability.of(Number.NaN)).toThrow(RangeError);
	});

	it("should return zero and one", () => {
		expect(Probability.zero()).toBe(0);
		expect(Probability.one()).toBe(1);
	});
});
