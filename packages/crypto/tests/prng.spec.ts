import { makePRNG } from "../src/domain/services/prng";

describe("makePRNG", () => {
	it("should return a function", () => {
		const prng = makePRNG(42);
		expect(typeof prng).toBe("function");
	});

	it("should return numbers between 0 and 1", () => {
		const prng = makePRNG(12345);
		for (let i = 0; i < 1000; i++) {
			const value = prng();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});

	it("should produce the same sequence for the same seed", () => {
		const prng1 = makePRNG(999);
		const prng2 = makePRNG(999);

		const seq1 = Array.from({ length: 20 }, () => prng1());
		const seq2 = Array.from({ length: 20 }, () => prng2());

		expect(seq1).toEqual(seq2);
	});

	it("should produce different sequences for different seeds", () => {
		const prng1 = makePRNG(100);
		const prng2 = makePRNG(200);

		const seq1 = Array.from({ length: 20 }, () => prng1());
		const seq2 = Array.from({ length: 20 }, () => prng2());

		expect(seq1).not.toEqual(seq2);
	});
});
