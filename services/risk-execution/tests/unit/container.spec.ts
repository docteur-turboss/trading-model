import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		EXECUTION_MODE: "live",
		DEPLOYMENT_ENV: "production",
		BROKER_API_KEY: "key",
	},
}));

import { createRiskExecutionApp } from "../../src/config/container";

describe("createRiskExecutionApp", () => {
	it("refuses EXECUTION_MODE=live even in production with live keys (ADR-0064 §9)", async () => {
		await expect(createRiskExecutionApp()).rejects.toThrow(/ADR-0064 §9/);
	});
});
