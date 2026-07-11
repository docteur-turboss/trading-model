import { describe, expect, it } from "@jest/globals";
import { DateRange } from "../../../src/domain/date-range";

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

	describe("contains", () => {
		it("should return true when date is within range", () => {
			const range = new DateRange(
				new Date("2024-01-01"),
				new Date("2024-12-31")
			);
			expect(range.contains(new Date("2024-06-15"))).toBe(true);
		});

		it("should return false when date is before start", () => {
			const range = new DateRange(
				new Date("2024-06-01"),
				new Date("2024-12-31")
			);
			expect(range.contains(new Date("2024-01-01"))).toBe(false);
		});

		it("should return false when date is after end", () => {
			const range = new DateRange(
				new Date("2024-01-01"),
				new Date("2024-06-30")
			);
			expect(range.contains(new Date("2024-12-31"))).toBe(false);
		});

		it("should include dates on boundaries", () => {
			const range = new DateRange(
				new Date("2024-01-01"),
				new Date("2024-12-31")
			);
			expect(range.contains(new Date("2024-01-01"))).toBe(true);
			expect(range.contains(new Date("2024-12-31"))).toBe(true);
		});
	});

	describe("durationMs", () => {
		it("should return duration when both dates are set", () => {
			const range = new DateRange(
				new Date("2024-01-01"),
				new Date("2024-01-02")
			);
			expect(range.durationMs).toBe(86400000);
		});

		it("should return undefined when start is missing", () => {
			const range = new DateRange(undefined, new Date("2024-01-02"));
			expect(range.durationMs).toBeUndefined();
		});

		it("should return undefined when end is missing", () => {
			const range = new DateRange(new Date("2024-01-01"), undefined);
			expect(range.durationMs).toBeUndefined();
		});
	});

	describe("overlaps", () => {
		it("should return true when ranges overlap", () => {
			const a = new DateRange(new Date("2024-01-01"), new Date("2024-06-30"));
			const b = new DateRange(new Date("2024-03-01"), new Date("2024-09-30"));
			expect(a.overlaps(b)).toBe(true);
		});

		it("should return false when ranges do not overlap", () => {
			const a = new DateRange(new Date("2024-01-01"), new Date("2024-02-01"));
			const b = new DateRange(new Date("2024-03-01"), new Date("2024-04-01"));
			expect(a.overlaps(b)).toBe(false);
		});

		it("should return false when either range has undefined boundaries", () => {
			const a = new DateRange(new Date("2024-01-01"), new Date("2024-06-30"));
			const b = new DateRange(undefined, new Date("2024-03-01"));
			expect(a.overlaps(b)).toBe(false);
		});
	});

	describe("fromUnixTimestamps", () => {
		it("should create range from unix timestamps", () => {
			const range = DateRange.fromUnixTimestamps(1704067200000, 1735689599999);
			expect(range.start).toEqual(new Date(1704067200000));
			expect(range.end).toEqual(new Date(1735689599999));
		});
	});
});
