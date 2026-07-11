import { describe, expect, it } from "@jest/globals";
import { DelayRange } from "../../../src/utils/delay-range";

describe("DelayRange", () => {
	describe("constructor", () => {
		it("should create a DelayRange with valid parameters", () => {
			const dr = new DelayRange(100, 5000);
			expect(dr.baseMs).toBe(100);
			expect(dr.maxMs).toBe(5000);
		});

		it("should throw when baseMs <= 0", () => {
			expect(() => new DelayRange(0, 100)).toThrow(RangeError);
			expect(() => new DelayRange(-1, 100)).toThrow(RangeError);
		});

		it("should throw when maxMs < baseMs", () => {
			expect(() => new DelayRange(200, 100)).toThrow(RangeError);
		});

		it("should allow maxMs equal to baseMs", () => {
			const dr = new DelayRange(100, 100);
			expect(dr.baseMs).toBe(100);
			expect(dr.maxMs).toBe(100);
		});
	});

	describe("backoff", () => {
		it("should return baseMs for attempt 0", () => {
			const dr = new DelayRange(100, 10000);
			expect(dr.backoff(0)).toBe(100);
		});

		it("should double each attempt", () => {
			const dr = new DelayRange(100, 10000);
			expect(dr.backoff(0)).toBe(100);
			expect(dr.backoff(1)).toBe(200);
			expect(dr.backoff(2)).toBe(400);
			expect(dr.backoff(3)).toBe(800);
		});

		it("should cap at maxMs", () => {
			const dr = new DelayRange(100, 500);
			expect(dr.backoff(0)).toBe(100);
			expect(dr.backoff(1)).toBe(200);
			expect(dr.backoff(2)).toBe(400);
			expect(dr.backoff(3)).toBe(500);
			expect(dr.backoff(10)).toBe(500);
		});
	});

	describe("withJitter", () => {
		it("should return backoff value when jitterMs is 0", () => {
			const dr = new DelayRange(100, 10000);
			expect(dr.withJitter(0, 0)).toBe(100);
		});

		it("should add jitter between 0 and jitterMs", () => {
			const dr = new DelayRange(100, 10000);
			for (let i = 0; i < 50; i++) {
				const result = dr.withJitter(1, 50);
				expect(result).toBeGreaterThanOrEqual(200);
				expect(result).toBeLessThan(250);
			}
		});

		it("should cap at maxMs even with jitter", () => {
			const dr = new DelayRange(100, 200);
			for (let i = 0; i < 50; i++) {
				const result = dr.withJitter(10, 100);
				expect(result).toBeLessThanOrEqual(300);
			}
		});
	});
});
