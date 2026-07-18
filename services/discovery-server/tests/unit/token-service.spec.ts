import { describe, expect, it } from "@jest/globals";
import {
	generateInstanceToken,
	validInstanceToken,
	verifyInstanceName,
} from "../../src/core/token-service";

describe("TokenService re-exports", () => {
	it("should re-export generateInstanceToken", () => {
		expect(generateInstanceToken).toBeDefined();
		expect(typeof generateInstanceToken).toBe("function");
	});

	it("should re-export validInstanceToken", () => {
		expect(validInstanceToken).toBeDefined();
		expect(typeof validInstanceToken).toBe("function");
	});

	it("should re-export verifyInstanceName", () => {
		expect(verifyInstanceName).toBeDefined();
		expect(typeof verifyInstanceName).toBe("function");
	});
});
