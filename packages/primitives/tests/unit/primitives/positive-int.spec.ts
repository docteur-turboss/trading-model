import { describe, expect, it } from "@jest/globals";
import { PositiveInt } from "../../../src/primitives/positive-int";

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
});
