import { describe, expect, it } from "@jest/globals";
import {
	isNonEmptyString,
	isObject,
	isValidIP,
	isValidPort,
} from "../../src/validation/primitives";

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

	describe("isValidPort", () => {
		it("should return true for valid port numbers", () => {
			expect(isValidPort(80)).toBe(true);
			expect(isValidPort(443)).toBe(true);
			expect(isValidPort(65535)).toBe(true);
			expect(isValidPort(1)).toBe(true);
		});

		it("should return false for invalid port numbers", () => {
			expect(isValidPort(0)).toBe(false);
			expect(isValidPort(65536)).toBe(false);
			expect(isValidPort(-1)).toBe(false);
		});

		it("should return false for non-integer numbers", () => {
			expect(isValidPort(80.5)).toBe(false);
		});

		it("should return false for non-number", () => {
			expect(isValidPort("80")).toBe(false);
			expect(isValidPort(null)).toBe(false);
		});
	});

	describe("isValidIP", () => {
		it("should return true for valid IP addresses", () => {
			expect(isValidIP("192.168.1.1")).toBe(true);
			expect(isValidIP("0.0.0.0")).toBe(true);
			expect(isValidIP("255.255.255.255")).toBe(true);
		});

		it("should return false for invalid IP addresses", () => {
			expect(isValidIP("abc.def.ghi.jkl")).toBe(false);
			expect(isValidIP("1.2.3")).toBe(false);
			expect(isValidIP("1.2.3.4.5")).toBe(false);
		});

		it("should return false for non-string", () => {
			expect(isValidIP(12345)).toBe(false);
			expect(isValidIP(null)).toBe(false);
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
