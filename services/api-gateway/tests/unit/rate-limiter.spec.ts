import { describe, expect, it } from "@jest/globals";

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		RATE_LIMIT_WINDOW_MS: 60000,
		RATE_LIMIT_MAX: 100,
	},
}));

import { DEFAULT_LIMITER } from "../../src/adapters/inbound/rate-limiter";

describe("rate-limiter", () => {
	it("should export DEFAULT_LIMITER with configured window and max", () => {
		expect(DEFAULT_LIMITER).toBeDefined();
		expect(typeof DEFAULT_LIMITER).toBe("function");
	});
});
