import { describe, expect, it } from "@jest/globals";
import { sanitizeForLog } from "../../src/utils/sanitize";

describe("sanitizeForLog", () => {
	it("handles many BEGIN markers without END in linear time", () => {
		const start = Date.now();
		const input = "-----BEGIN X-----".repeat(20000);
		expect(sanitizeForLog(input)).toBe(input);
		expect(Date.now() - start).toBeLessThan(1000);
	});

	it("should redact PEM content in strings", () => {
		const pemStr =
			"some text\n-----BEGIN CERTIFICATE-----\nZm9v\n-----END CERTIFICATE-----\nmore text";
		expect(sanitizeForLog(pemStr)).toBe("some text\n[REDACTED PEM]\nmore text");
	});

	it("should return strings without PEM content unchanged", () => {
		expect(sanitizeForLog("hello world")).toBe("hello world");
	});

	it("should convert Error objects to safe shape", () => {
		const err = new Error("test error");
		const result = sanitizeForLog(err) as Record<string, unknown>;
		expect(result).toHaveProperty("name", "Error");
		expect(result).toHaveProperty("message", "test error");
		expect(result).toHaveProperty("stack");
	});

	it("should keep the cause chain and error code of wrapped errors", () => {
		const root = Object.assign(new Error("connect ECONNREFUSED"), {
			code: "ECONNREFUSED",
		});
		const wrapped = Object.assign(new Error("Failed to publish"), {
			cause: root,
		});

		const result = sanitizeForLog(wrapped) as Record<string, unknown>;

		expect(result.cause).toMatchObject({
			message: "connect ECONNREFUSED",
			code: "ECONNREFUSED",
		});
	});

	it("should handle Error instances without a stack property", () => {
		const err = new Error("test");
		Object.defineProperty(err, "stack", { value: undefined });
		const result = sanitizeForLog(err) as Record<string, unknown>;
		expect(result).toHaveProperty("name", "Error");
		expect(result).toHaveProperty("message", "test");
		expect(result).not.toHaveProperty("stack");
	});

	it("should handle plain objects with name/message but not Error instances", () => {
		const err = { name: "TypeError", message: "bad" };
		const result = sanitizeForLog(err) as Record<string, unknown>;
		expect(result).toHaveProperty("name", "TypeError");
		expect(result).toHaveProperty("message", "bad");
		expect(result).not.toHaveProperty("stack");
	});

	it("should return primitives unchanged", () => {
		expect(sanitizeForLog(42)).toBe(42);
		expect(sanitizeForLog(true)).toBe(true);
		expect(sanitizeForLog(null)).toBeNull();
		expect(sanitizeForLog(undefined)).toBeUndefined();
	});
});
