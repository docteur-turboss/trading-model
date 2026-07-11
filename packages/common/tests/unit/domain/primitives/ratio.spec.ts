import { describe, expect, it } from "@jest/globals";
import { Ratio } from "../../../../src/domain/primitives/ratio";

describe("Ratio", () => {
	it("should create a valid ratio", () => {
		expect(Ratio.of(1.5)).toBe(1.5);
		expect(Ratio.of(0)).toBe(0);
		expect(Ratio.of(-1)).toBe(-1);
	});

	it("should throw for non-finite values", () => {
		expect(() => Ratio.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => Ratio.of(Number.NaN)).toThrow(RangeError);
	});

	it("should return zero", () => {
		expect(Ratio.zero()).toBe(0);
	});

	it("should convert to number", () => {
		expect(Ratio.toNumber(2.5 as never)).toBe(2.5);
	});

	it("should add, subtract, multiply", () => {
		expect(Ratio.add(1 as never, 2 as never)).toBe(3);
		expect(Ratio.subtract(5 as never, 3 as never)).toBe(2);
		expect(Ratio.multiply(2 as never, 3 as never)).toBe(6);
	});

	it("should compare", () => {
		expect(Ratio.gt(5 as never, 3 as never)).toBe(true);
		expect(Ratio.lt(3 as never, 5 as never)).toBe(true);
	});

	it("should compute absolute value", () => {
		expect(Ratio.abs(-5 as never)).toBe(5);
		expect(Ratio.abs(5 as never)).toBe(5);
	});
});
