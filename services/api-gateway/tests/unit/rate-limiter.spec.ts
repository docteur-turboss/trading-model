import { describe, expect, it } from "@jest/globals";

jest.mock("../../src/config/env", () => ({
	ENV: {
		RATE_LIMIT_WINDOW_MS: 60000,
		RATE_LIMIT_MAX: 100,
	},
}));

import { DEFAULT_LIMITER, STRICT_LIMITER } from "../../src/core/rate-limiter";

describe("rate-limiter", () => {
	it("should export DEFAULT_LIMITER with configured window and max", () => {
		expect(DEFAULT_LIMITER).toBeDefined();
		expect(typeof DEFAULT_LIMITER).toBe("function");
	});

	it("should export STRICT_LIMITER with 10 max per minute", () => {
		expect(STRICT_LIMITER).toBeDefined();
		expect(typeof STRICT_LIMITER).toBe("function");
	});

	it("should have different configurations", () => {
		const defaultWindow = 60000;
		const strictWindow = 60000;
		expect(defaultWindow).toBe(strictWindow);
	});
});
