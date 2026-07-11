import { describe, expect, it } from "@jest/globals";
import { Cash } from "../../../../src/domain/primitives/cash";

describe("Cash", () => {
	it("should create a valid cash value", () => {
		expect(Cash.of(100)).toBe(100);
		expect(Cash.of(0)).toBe(0);
	});

	it("should throw for negative values", () => {
		expect(() => Cash.of(-1)).toThrow(RangeError);
	});

	it("should throw for non-finite values", () => {
		expect(() => Cash.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => Cash.of(Number.NaN)).toThrow(RangeError);
	});

	it("should return zero", () => {
		expect(Cash.zero()).toBe(0);
	});

	it("should add two cash values", () => {
		expect(Cash.add(10 as never, 20 as never)).toBe(30);
	});

	it("should subtract two cash values", () => {
		expect(Cash.sub(20 as never, 10 as never)).toBe(10);
	});

	it("should compare cash values", () => {
		expect(Cash.gt(20 as never, 10 as never)).toBe(true);
		expect(Cash.gt(10 as never, 20 as never)).toBe(false);
		expect(Cash.lt(10 as never, 20 as never)).toBe(true);
		expect(Cash.lt(20 as never, 10 as never)).toBe(false);
	});

	it("should round cash values", () => {
		expect(Cash.round(10.567 as never, 2)).toBe(10.57);
		expect(Cash.round(10.56 as never, 1)).toBe(10.6);
	});

	it("should compute from product", () => {
		expect(Cash.fromProduct(10 as never, 5 as never)).toBe(50);
	});

	it("should convert to number", () => {
		expect(Cash.toNumber(42 as never)).toBe(42);
	});
});
