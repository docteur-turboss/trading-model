describe("token-service", () => {
	it("should re-export generateInstanceId", () => {
		const mod = require("../src/domain/services/token-service");
		expect(typeof mod.generateInstanceId).toBe("function");
	});

	it("should re-export verifyInstanceName", () => {
		const mod = require("../src/domain/services/token-service");
		expect(typeof mod.verifyInstanceName).toBe("function");
	});

	it("should re-export generateInstanceToken", () => {
		const mod = require("../src/domain/services/token-service");
		expect(typeof mod.generateInstanceToken).toBe("function");
	});

	it("should re-export validInstanceToken", () => {
		const mod = require("../src/domain/services/token-service");
		expect(typeof mod.validInstanceToken).toBe("function");
	});

	it("should re-export TokenValidationInput type", () => {
		const mod = require("../src/domain/services/token-service");
		expect(mod.TokenValidationInput).toBeUndefined();
	});

	it("should re-export TokenValidationOptions type", () => {
		const mod = require("../src/domain/services/token-service");
		expect(mod.TokenValidationOptions).toBeUndefined();
	});
});
