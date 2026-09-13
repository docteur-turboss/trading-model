import { describe, expect, it } from "@jest/globals";
import { Temperature } from "../../../../src/domain/primitives/temperature";

describe("Temperature", () => {
	it("should create a valid temperature", () => {
		expect(Temperature.of(0)).toBe(0);
		expect(Temperature.of(1.5)).toBe(1.5);
	});

	it("should throw for negative values", () => {
		expect(() => Temperature.of(-0.1)).toThrow(RangeError);
	});

	it("should throw for non-finite values", () => {
		expect(() => Temperature.of(Number.NaN)).toThrow(RangeError);
		expect(() => Temperature.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
	});

	it("should return zero", () => {
		expect(Temperature.zero()).toBe(0);
	});

	it("should convert to number", () => {
		expect(Temperature.toNumber(0.7 as never)).toBe(0.7);
	});
});
