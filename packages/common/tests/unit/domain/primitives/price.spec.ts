import { describe, expect, it } from "@jest/globals";
import { Price } from "../../../../src/domain/primitives/price";

describe("Price", () => {
	it("should create a valid price", () => {
		expect(Price.of(100)).toBe(100);
		expect(Price.of(0)).toBe(0);
	});

	it("should throw for negative values", () => {
		expect(() => Price.of(-1)).toThrow(RangeError);
	});

	it("should throw for non-finite values", () => {
		expect(() => Price.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => Price.of(Number.NaN)).toThrow(RangeError);
	});

	it("should return zero", () => {
		expect(Price.zero()).toBe(0);
	});

	it("should add and subtract", () => {
		expect(Price.add(10 as never, 20 as never)).toBe(30);
		expect(Price.sub(20 as never, 10 as never)).toBe(10);
	});

	it("should compare", () => {
		expect(Price.gt(20 as never, 10 as never)).toBe(true);
		expect(Price.lt(10 as never, 20 as never)).toBe(true);
	});

	it("should convert to number", () => {
		expect(Price.toNumber(42 as never)).toBe(42);
	});
});
