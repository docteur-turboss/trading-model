import { describe, expect, it } from "@jest/globals";
import { Percentage } from "../../../../src/domain/primitives/percentage";

describe("Percentage", () => {
	it("should create a valid percentage", () => {
		expect(Percentage.of(0.5)).toBe(0.5);
	});

	it("should throw for non-finite values", () => {
		expect(() => Percentage.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => Percentage.of(Number.NaN)).toThrow(RangeError);
	});

	it("should create from percent", () => {
		expect(Percentage.fromPercent(50)).toBe(0.5);
	});

	it("should return zero and one", () => {
		expect(Percentage.zero()).toBe(0);
		expect(Percentage.one()).toBe(1);
	});

	it("should convert to fraction and percent", () => {
		expect(Percentage.toFraction(0.5 as never)).toBe(0.5);
		expect(Percentage.toPercent(0.5 as never)).toBe(50);
	});

	it("should add, subtract, multiply", () => {
		expect(Percentage.add(0.25 as never, 0.25 as never)).toBeCloseTo(0.5, 10);
		expect(Percentage.subtract(0.5 as never, 0.25 as never)).toBeCloseTo(
			0.25,
			10
		);
		expect(Percentage.multiply(0.5 as never, 0.5 as never)).toBe(0.25);
	});

	it("should compute ofValue", () => {
		expect(Percentage.ofValue(0.5 as never, 100)).toBe(50);
	});

	it("should round", () => {
		expect(Percentage.round(0.5678 as never, 2)).toBe(0.57);
	});

	it("should compare", () => {
		expect(Percentage.gt(0.5 as never, 0.3 as never)).toBe(true);
		expect(Percentage.lt(0.3 as never, 0.5 as never)).toBe(true);
	});

	it("should convert to number", () => {
		expect(Percentage.toNumber(0.5 as never)).toBe(0.5);
	});
});
