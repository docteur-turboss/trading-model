import { describe, expect, it } from "@jest/globals";
import { NoiseStd } from "../../../../src/domain/primitives/noise-std";

describe("NoiseStd", () => {
	it("should create a valid noise std", () => {
		expect(NoiseStd.of(0)).toBe(0);
		expect(NoiseStd.of(0.25)).toBe(0.25);
	});

	it("should throw for negative values", () => {
		expect(() => NoiseStd.of(-0.1)).toThrow(RangeError);
	});

	it("should throw for non-finite values", () => {
		expect(() => NoiseStd.of(Number.NaN)).toThrow(RangeError);
		expect(() => NoiseStd.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
	});

	it("should return zero", () => {
		expect(NoiseStd.zero()).toBe(0);
	});

	it("should convert to number", () => {
		expect(NoiseStd.toNumber(0.5 as never)).toBe(0.5);
	});
});
