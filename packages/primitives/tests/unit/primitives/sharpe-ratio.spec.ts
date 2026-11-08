import { describe, expect, it } from "@jest/globals";
import { SharpeRatio } from "../../../src/primitives/sharpe-ratio";

describe("SharpeRatio", () => {
	it("should create a valid sharpe ratio", () => {
		expect(SharpeRatio.of(1.5)).toBe(1.5);
		expect(SharpeRatio.of(0)).toBe(0);
		expect(SharpeRatio.of(-2)).toBe(-2);
	});

	it("should throw for non-finite values", () => {
		expect(() => SharpeRatio.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => SharpeRatio.of(Number.NaN)).toThrow(RangeError);
	});
});
