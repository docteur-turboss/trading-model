import { describe, expect, it } from "@jest/globals";
import { sanitizePayload } from "../../../../src/messaging/core/payload-sanitizer";

describe("sanitizePayload", () => {
	it("should return primitives unchanged", () => {
		expect(sanitizePayload(42)).toBe(42);
		expect(sanitizePayload("hello")).toBe("hello");
		expect(sanitizePayload(true)).toBe(true);
		expect(sanitizePayload(null)).toBe(null);
	});

	it("should sanitize nested objects recursively", () => {
		const input = { a: { b: { c: 1 } } };
		expect(sanitizePayload(input)).toEqual({ a: { b: { c: 1 } } });
	});

	it("should sanitize arrays", () => {
		const input = [1, [2, 3], { key: "value" }];
		expect(sanitizePayload(input)).toEqual([1, [2, 3], { key: "value" }]);
	});

	it("should throw on MongoDB operator keys", () => {
		expect(() => sanitizePayload({ $where: "malicious" })).toThrow(
			"Blocked operator"
		);
		expect(() => sanitizePayload({ $regex: ".*" })).toThrow("Blocked operator");
		expect(() => sanitizePayload({ nested: { $ne: 1 } })).toThrow(
			"Blocked operator"
		);
	});

	it("should not block keys starting with $ that are not MongoDB operators", () => {
		const input = { $custom: "value", $$ref: "data" };
		expect(sanitizePayload(input)).toEqual(input);
	});

	it("should throw when exceeding maximum nesting depth", () => {
		const deep: Record<string, unknown> = {};
		let current = deep;
		for (let i = 0; i < 11; i++) {
			current.nested = {};
			current = current.nested as Record<string, unknown>;
		}

		expect(() => sanitizePayload(deep)).toThrow(
			"Payload exceeds maximum nesting depth"
		);
	});

	it("should not throw at depth just below max", () => {
		const deep: Record<string, unknown> = {};
		let current = deep;
		for (let i = 0; i < 9; i++) {
			current.nested = {};
			current = current.nested as Record<string, unknown>;
		}

		expect(() => sanitizePayload(deep)).not.toThrow();
	});
});
