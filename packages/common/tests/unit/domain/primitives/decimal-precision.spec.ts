import { describe, expect, it } from "@jest/globals";
import { DecimalPrecision } from "../../../../src/domain/primitives/decimal-precision";

describe("DecimalPrecision", () => {
	it("should create valid precision values", () => {
		expect(DecimalPrecision.of(0)).toBe(0);
		expect(DecimalPrecision.of(8)).toBe(8);
		expect(DecimalPrecision.of(15)).toBe(15);
	});

	it("should throw for negative values", () => {
		expect(() => DecimalPrecision.of(-1)).toThrow(RangeError);
	});

	it("should throw for values > 15", () => {
		expect(() => DecimalPrecision.of(16)).toThrow(RangeError);
	});

	it("should throw for non-integers", () => {
		expect(() => DecimalPrecision.of(1.5)).toThrow(RangeError);
	});

	it("should round values", () => {
		expect(DecimalPrecision.round(10.5678, 2 as never)).toBe(10.57);
		expect(DecimalPrecision.round(10.5, 0 as never)).toBe(11);
	});

	it("should convert to number", () => {
		expect(DecimalPrecision.toNumber(8 as never)).toBe(8);
	});
});
