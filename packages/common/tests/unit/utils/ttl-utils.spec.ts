import { describe, expect, it, jest } from "@jest/globals";
import {
	isExpired,
	isExpiredAt,
	isExpiredElapsed,
} from "../../../src/utils/ttl-utils";

describe("ttl-utils", () => {
	it("isExpired should return false for future expiry", () => {
		jest.spyOn(Date, "now").mockReturnValue(1000);
		expect(isExpired({ value: 1, expiresAt: 5000 })).toBe(false);
		jest.restoreAllMocks();
	});

	it("isExpired should return true for past expiry", () => {
		jest.spyOn(Date, "now").mockReturnValue(10_000);
		expect(isExpired({ value: 1, expiresAt: 5000 })).toBe(true);
		jest.restoreAllMocks();
	});

	it("isExpiredAt should compare against now", () => {
		jest.spyOn(Date, "now").mockReturnValue(1000);
		expect(isExpiredAt(5000)).toBe(false);
		expect(isExpiredAt(500)).toBe(true);
		jest.restoreAllMocks();
	});

	it("isExpiredElapsed should compare elapsed time", () => {
		jest.spyOn(Date, "now").mockReturnValue(1000);
		expect(isExpiredElapsed(0, 5000)).toBe(false);
		expect(isExpiredElapsed(0, 500)).toBe(true);
		jest.restoreAllMocks();
	});
});
