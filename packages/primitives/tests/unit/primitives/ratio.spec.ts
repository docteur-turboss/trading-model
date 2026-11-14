import { describe, expect, it } from "@jest/globals";
import { Ratio } from "../../../src/primitives/ratio";

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
});
