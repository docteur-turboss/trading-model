import { describe, expect, it } from "@jest/globals";
import { Reward } from "../../../../src/domain/primitives/reward";

describe("Reward", () => {
	it("should create a valid reward value", () => {
		expect(Reward.of(10)).toBe(10);
		expect(Reward.of(0)).toBe(0);
		expect(Reward.of(-5)).toBe(-5);
	});

	it("should throw for non-finite values", () => {
		expect(() => Reward.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => Reward.of(Number.NaN)).toThrow(RangeError);
	});

	it("should return zero", () => {
		expect(Reward.zero()).toBe(0);
	});
});
