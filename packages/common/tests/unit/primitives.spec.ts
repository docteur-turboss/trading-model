import { describe, expect, it } from "@jest/globals";
import {
	isNonEmptyString,
	isObject,
} from "@trading-model/validation/validation/primitives";

describe("primitives", () => {
	describe("isNonEmptyString", () => {
		it("should return true for non-empty string", () => {
			expect(isNonEmptyString("hello")).toBe(true);
		});

		it("should return false for empty string", () => {
			expect(isNonEmptyString("")).toBe(false);
		});

		it("should return false for whitespace-only string", () => {
			expect(isNonEmptyString("   ")).toBe(false);
		});

		it("should return false for non-string", () => {
			expect(isNonEmptyString(42)).toBe(false);
			expect(isNonEmptyString(null)).toBe(false);
			expect(isNonEmptyString(undefined)).toBe(false);
		});
	});

	describe("isObject", () => {
		it("should return true for plain object", () => {
			expect(isObject({ a: 1 })).toBe(true);
			expect(isObject({})).toBe(true);
		});

		it("should return false for null", () => {
			expect(isObject(null)).toBe(false);
		});

		it("should return false for array", () => {
			expect(isObject([1, 2, 3])).toBe(false);
		});

		it("should return false for other types", () => {
			expect(isObject("object")).toBe(false);
			expect(isObject(42)).toBe(false);
			expect(isObject(undefined)).toBe(false);
		});
	});
});
