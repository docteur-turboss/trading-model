import { describe, expect, it } from "@jest/globals";
import { DateRange } from "../../src/date-range";

describe("DateRange", () => {
	it("should create a range with start and end", () => {
		const start = new Date("2024-01-01");
		const end = new Date("2024-12-31");
		const range = new DateRange(start, end);
		expect(range.start).toBe(start);
		expect(range.end).toBe(end);
	});

	it("should throw when start is after end", () => {
		const start = new Date("2024-12-31");
		const end = new Date("2024-01-01");
		expect(() => new DateRange(start, end)).toThrow(RangeError);
	});

	it("should allow undefined start", () => {
		const range = new DateRange(undefined, new Date("2024-12-31"));
		expect(range.start).toBeUndefined();
		expect(range.end).toBeDefined();
	});

	it("should allow undefined end", () => {
		const range = new DateRange(new Date("2024-01-01"), undefined);
		expect(range.start).toBeDefined();
		expect(range.end).toBeUndefined();
	});

	describe("fromQueryParams", () => {
		it("should return undefined when no params provided", () => {
			expect(DateRange.fromQueryParams()).toBeUndefined();
		});

		it("should create range from start date string", () => {
			const range = DateRange.fromQueryParams("2024-01-01")!;
			expect(range.start).toEqual(new Date("2024-01-01"));
			expect(range.end).toBeUndefined();
		});

		it("should create range from both date strings", () => {
			const range = DateRange.fromQueryParams("2024-01-01", "2024-12-31")!;
			expect(range.start).toEqual(new Date("2024-01-01"));
			expect(range.end).toEqual(new Date("2024-12-31"));
		});
	});
});
