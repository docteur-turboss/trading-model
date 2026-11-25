import { generateRandomStr, sha256Hex } from "../src/node-crypto";

describe("generateRandomStr", () => {
	it("should return a non-empty string", () => {
		const result = generateRandomStr();
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("should return a base64url-encoded string", () => {
		const result = generateRandomStr();
		expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it("should return different values on multiple calls", () => {
		const results = new Set<string>();
		for (let i = 0; i < 10; i++) {
			results.add(generateRandomStr());
		}
		expect(results.size).toBeGreaterThan(1);
	});
});

describe("sha256Hex", () => {
	it("should return the hex SHA-256 digest", () => {
		expect(sha256Hex("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
		);
	});
});
