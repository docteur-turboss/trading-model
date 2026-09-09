import { describe, expect, it } from "@jest/globals";
import { generateInstanceToken } from "@trading-model/crypto/domain/services/token-generator";

describe("generateInstanceToken", () => {
	it("should generate a 3-part token", () => {
		const token = generateInstanceToken(
			"i-123" as never,
			"test-secret-key-12345"
		);
		const parts = token.split(".");
		expect(parts.length).toBe(3);
		expect(parts[0]).toBeTruthy();
		expect(parts[1]).toBeTruthy();
		expect(parts[2]).toBeTruthy();
	});
});
