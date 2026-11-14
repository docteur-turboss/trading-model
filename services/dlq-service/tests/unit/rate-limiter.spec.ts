import { describe, expect, it } from "@jest/globals";
import {
	_createHealthLimiter,
	_createReplayLimiter,
	_createWriteLimiter,
} from "../../src/adapters/inbound/rate-limiter";

describe("rate-limiter", () => {
	it("creates in-memory limiters (no Redis store)", () => {
		for (const create of [
			_createReplayLimiter,
			_createWriteLimiter,
			_createHealthLimiter,
		]) {
			expect(typeof create()).toBe("function");
		}
	});
});
