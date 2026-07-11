import { describe, expect, it } from "@jest/globals";
import { UnixTimestamp } from "../../../../src/domain/primitives/unix-timestamp";

describe("UnixTimestamp", () => {
	it("should create a valid timestamp", () => {
		expect(UnixTimestamp.of(1000)).toBe(1000);
		expect(UnixTimestamp.of(0)).toBe(0);
	});

	it("should throw for negative values", () => {
		expect(() => UnixTimestamp.of(-1)).toThrow(RangeError);
	});

	it("should throw for non-finite values", () => {
		expect(() => UnixTimestamp.of(Number.POSITIVE_INFINITY)).toThrow(
			RangeError
		);
		expect(() => UnixTimestamp.of(Number.NaN)).toThrow(RangeError);
	});

	it("should return current time", () => {
		const now = Date.now();
		const ts = UnixTimestamp.now();
		expect(ts).toBeGreaterThanOrEqual(now);
	});

	it("should convert to Date", () => {
		const date = UnixTimestamp.toDate(1000 as never);
		expect(date).toBeInstanceOf(Date);
		expect(date.getTime()).toBe(1000);
	});

	it("should compare timestamps", () => {
		expect(UnixTimestamp.isAfter(200 as never, 100 as never)).toBe(true);
		expect(UnixTimestamp.isAfter(100 as never, 200 as never)).toBe(false);
		expect(UnixTimestamp.isBefore(100 as never, 200 as never)).toBe(true);
	});

	it("should add and subtract", () => {
		expect(UnixTimestamp.add(100 as never, 50)).toBe(150);
		expect(UnixTimestamp.subtract(100 as never, 50)).toBe(50);
	});

	it("should compute elapsed", () => {
		const past = Date.now() - 1000;
		const elapsed = UnixTimestamp.elapsed(past as never);
		expect(elapsed).toBeGreaterThanOrEqual(900);
	});
});
