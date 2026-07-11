import { describe, expect, it } from "@jest/globals";
import { Volume } from "../../../../src/domain/primitives/volume";

describe("Volume", () => {
	it("should create a valid volume", () => {
		expect(Volume.of(100)).toBe(100);
		expect(Volume.of(0)).toBe(0);
	});

	it("should throw for negative values", () => {
		expect(() => Volume.of(-1)).toThrow(RangeError);
	});

	it("should throw for non-finite values", () => {
		expect(() => Volume.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => Volume.of(Number.NaN)).toThrow(RangeError);
	});

	it("should return zero", () => {
		expect(Volume.zero()).toBe(0);
	});

	it("should add and subtract", () => {
		expect(Volume.add(10 as never, 20 as never)).toBe(30);
		expect(Volume.sub(20 as never, 10 as never)).toBe(10);
	});

	it("should compare", () => {
		expect(Volume.gt(20 as never, 10 as never)).toBe(true);
		expect(Volume.lt(10 as never, 20 as never)).toBe(true);
	});

	it("should convert to number", () => {
		expect(Volume.toNumber(42 as never)).toBe(42);
	});
});
