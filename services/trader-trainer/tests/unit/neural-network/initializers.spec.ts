import { describe, expect, test } from "@jest/globals";
import { INITIALIZERS } from "../../../src/core/neural-network/initializers";

describe("Initializers", () => {
	test("zeros should return 0", () => {
		expect(INITIALIZERS.zeros.initialize({ fanIn: 5, fanOut: 3 })).toBe(0);
	});

	test("he should return a finite number", () => {
		const result = INITIALIZERS.he.initialize({ fanIn: 10, fanOut: 5 });
		expect(Number.isFinite(result)).toBe(true);
	});

	test("xavier should return a number in [-limit, limit]", () => {
		for (let i = 0; i < 100; i++) {
			const result = INITIALIZERS.xavier.initialize({ fanIn: 10, fanOut: 5 });
			expect(result).toBeGreaterThanOrEqual(-1);
			expect(result).toBeLessThanOrEqual(1);
		}
	});

	test("leCun should return a finite number", () => {
		const result = INITIALIZERS.leCun.initialize({ fanIn: 10, fanOut: 5 });
		expect(Number.isFinite(result)).toBe(true);
	});

	test("random should return a number in [-1, 1]", () => {
		for (let i = 0; i < 100; i++) {
			const result = INITIALIZERS.random.initialize({ fanIn: 0, fanOut: 0 });
			expect(result).toBeGreaterThanOrEqual(-1);
			expect(result).toBeLessThanOrEqual(1);
		}
	});
});
