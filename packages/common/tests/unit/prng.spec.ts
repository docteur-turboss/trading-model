import { describe, expect, it } from "@jest/globals";
import { makePRNG } from "../../src/crypto/prng";

describe("makePRNG", () => {
	it("should return a function", () => {
		const gen = makePRNG(42);
		expect(typeof gen).toBe("function");
	});

	it("should generate deterministic values for same seed", () => {
		const gen1 = makePRNG(12345);
		const gen2 = makePRNG(12345);
		expect(gen1()).toBe(gen2());
		expect(gen1()).toBe(gen2());
	});

	it("should generate different values for different seeds", () => {
		const gen1 = makePRNG(1);
		const gen2 = makePRNG(2);
		expect(gen1()).not.toBe(gen2());
	});

	it("should generate values between 0 and 1", () => {
		const gen = makePRNG(999);
		for (let i = 0; i < 100; i++) {
			const v = gen();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});
});
