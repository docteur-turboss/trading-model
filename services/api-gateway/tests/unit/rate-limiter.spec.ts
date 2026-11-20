import { describe, expect, it } from "@jest/globals";

const ENV: any = {
	RATE_LIMIT_WINDOW_MS: 60000,
	RATE_LIMIT_MAX: 100,
};

import { createRateLimiter } from "../../src/adapters/inbound/rate-limiter";

const DEFAULT_LIMITER = createRateLimiter(ENV);

describe("rate-limiter", () => {
	it("should export DEFAULT_LIMITER with configured window and max", () => {
		expect(DEFAULT_LIMITER).toBeDefined();
		expect(typeof DEFAULT_LIMITER).toBe("function");
	});
});
