import { describe, expect, it } from "@jest/globals";
import { NumericRange } from "../../../src/domain/numeric-range";

describe("NumericRange", () => {
	it("should create a range with lo and hi", () => {
		const range = new NumericRange(0, 100);
		expect(range.lo).toBe(0);
		expect(range.hi).toBe(100);
	});

	it("should throw when lo is greater than hi", () => {
		expect(() => new NumericRange(100, 0)).toThrow(RangeError);
	});

	it("should allow lo equal to hi", () => {
		const range = new NumericRange(5, 5);
		expect(range.lo).toBe(5);
		expect(range.hi).toBe(5);
	});

	describe("contains", () => {
		it("should return true for value within range", () => {
			const range = new NumericRange(0, 100);
			expect(range.contains(50)).toBe(true);
		});

		it("should return true for value at boundaries", () => {
			const range = new NumericRange(0, 100);
			expect(range.contains(0)).toBe(true);
			expect(range.contains(100)).toBe(true);
		});

		it("should return false for value below lo", () => {
			const range = new NumericRange(0, 100);
			expect(range.contains(-1)).toBe(false);
		});

		it("should return false for value above hi", () => {
			const range = new NumericRange(0, 100);
			expect(range.contains(101)).toBe(false);
		});
	});

	describe("clamp", () => {
		it("should return the value when within range", () => {
			const range = new NumericRange(0, 100);
			expect(range.clamp(50)).toBe(50);
		});

		it("should return lo when value is below", () => {
			const range = new NumericRange(0, 100);
			expect(range.clamp(-10)).toBe(0);
		});

		it("should return hi when value is above", () => {
			const range = new NumericRange(0, 100);
			expect(range.clamp(200)).toBe(100);
		});
	});

	describe("span", () => {
		it("should return the difference between hi and lo", () => {
			const range = new NumericRange(10, 50);
			expect(range.span()).toBe(40);
		});

		it("should return 0 when lo equals hi", () => {
			const range = new NumericRange(5, 5);
			expect(range.span()).toBe(0);
		});
	});
});
