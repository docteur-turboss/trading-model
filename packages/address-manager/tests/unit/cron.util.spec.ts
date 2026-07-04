import { describe, expect, it } from "@jest/globals";
import { intervalMsToCron } from "../../src/scheduler/cron.util";

describe("intervalMsToCron", () => {
	it("should use seconds-based cron for sub-minute intervals", () => {
		expect(intervalMsToCron(30_000)).toBe("*/30 * * * * *");
	});

	it("should use seconds-based cron rounding to nearest second", () => {
		expect(intervalMsToCron(59_500)).toBe("*/60 * * * * *");
	});

	it("should return */5 for a 5-minute interval", () => {
		expect(intervalMsToCron(5 * 60_000)).toBe("*/5 * * * *");
	});

	it("should floor fractional minutes", () => {
		expect(intervalMsToCron(125_000)).toBe("*/2 * * * *");
	});

	it("should return 1 second for zero interval", () => {
		expect(intervalMsToCron(0)).toBe("*/1 * * * * *");
	});

	it("should return 1 second for negative intervals", () => {
		expect(intervalMsToCron(-5000)).toBe("*/1 * * * * *");
	});

	it("should handle large intervals", () => {
		expect(intervalMsToCron(120 * 60_000)).toBe("*/120 * * * *");
	});
});
