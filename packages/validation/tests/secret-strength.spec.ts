import { weakSecretReason } from "../src/config/secret-strength";

describe("weakSecretReason", () => {
	it("accepts a long random secret", () => {
		expect(weakSecretReason("a".repeat(32))).toBeUndefined();
	});

	it("rejects a short secret", () => {
		expect(weakSecretReason("x".repeat(31))).toContain("32 characters");
	});

	it.each(["change-me", "CHANGEME"])("rejects a placeholder %s", (word) => {
		expect(weakSecretReason(`${word}-${"0".repeat(32)}`)).toContain(
			"placeholder"
		);
	});
});
