import { describe, expect, it } from "@jest/globals";
import { PositiveInt } from "../../../../src/domain/primitives/positive-int";

describe("PositiveInt", () => {
	it("should create a valid positive integer", () => {
		expect(PositiveInt.of(1)).toBe(1);
		expect(PositiveInt.of(5)).toBe(5);
	});

	it("should throw for zero", () => {
		expect(() => PositiveInt.of(0)).toThrow(RangeError);
	});

	it("should throw for negative integers", () => {
		expect(() => PositiveInt.of(-1)).toThrow(RangeError);
	});

	it("should throw for non-integers", () => {
		expect(() => PositiveInt.of(1.5)).toThrow(RangeError);
	});

	it("should return one", () => {
		expect(PositiveInt.one()).toBe(1);
	});

	it("should return next value", () => {
		expect(PositiveInt.next(1 as never)).toBe(2);
	});

	it("should return prev value", () => {
		expect(PositiveInt.prev(5 as never)).toBe(4);
	});

	it("should throw prev at minimum", () => {
		expect(() => PositiveInt.prev(1 as never)).toThrow(RangeError);
	});

	it("should clamp values", () => {
		expect(PositiveInt.clamp(5, 1 as never, 10 as never)).toBe(5);
		expect(PositiveInt.clamp(0, 1 as never, 10 as never)).toBe(1);
		expect(PositiveInt.clamp(15, 1 as never, 10 as never)).toBe(10);
	});

	it("should convert to number", () => {
		expect(PositiveInt.toNumber(42 as never)).toBe(42);
	});
});
