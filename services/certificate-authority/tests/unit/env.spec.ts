import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/validation/env", () => ({
	BaseEnvSchema: { extend: jest.fn(() => ({})) },
	validateEnv: jest.fn(() => ({ PORT: 8443 })),
}));

import { ENV } from "../../src/config/env";

describe("ENV", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should export the validated env object", () => {
		expect(ENV).toBeDefined();
		expect(ENV.PORT).toBe(8443);
	});
});
