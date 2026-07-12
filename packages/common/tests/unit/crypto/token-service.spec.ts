import { describe, expect, it } from "@jest/globals";
import * as tokenService from "@trading-model/crypto/crypto/token-service";

describe("token-service", () => {
	it("should re-export generateInstanceId", () => {
		expect(typeof tokenService.generateInstanceId).toBe("function");
	});

	it("should re-export verifyInstanceName", () => {
		expect(typeof tokenService.verifyInstanceName).toBe("function");
	});

	it("should re-export generateInstanceToken", () => {
		expect(typeof tokenService.generateInstanceToken).toBe("function");
	});

	it("should re-export validInstanceToken", () => {
		expect(typeof tokenService.validInstanceToken).toBe("function");
	});
});
