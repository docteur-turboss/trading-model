import { describe, expect, it } from "@jest/globals";
import { generateRandomStr } from "@trading-model/crypto/crypto/random";

describe("generateRandomStr", () => {
	it("should return a string", () => {
		const result = generateRandomStr();
		expect(typeof result).toBe("string");
	});

	it("should return a non-empty string", () => {
		const result = generateRandomStr();
		expect(result.length).toBeGreaterThan(0);
	});

	it("should return different values on successive calls", () => {
		const a = generateRandomStr();
		const b = generateRandomStr();
		expect(a).not.toBe(b);
	});
});
