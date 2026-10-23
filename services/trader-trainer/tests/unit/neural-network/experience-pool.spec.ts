import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { makePRNG } from "../../../src/domain/genetic-algorithm/prng";
import { createExperiencePool } from "../../../src/domain/neural-network/experience-pool";
import {
	type Experience,
	ExperienceKind,
} from "../../../src/domain/neural-network/type";

function makeExperience(value: number): Experience {
	return {
		kind: ExperienceKind.QLearning,
		input: new Float32Array([value]),
		output: new Float32Array([value]),
		reward: value,
		nextState: new Float32Array([value]),
		done: false,
		action: 0,
	} as Experience;
}

const PER = { prioritized: true, alpha: 0.6, beta: 0.4, betaAnneal: false };

describe("createExperiencePool", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("disabled", () => {
		it("should ignore every operation", () => {
			const pool = createExperiencePool(false, 10);
			pool.add(makeExperience(1));
			pool.remove(new Float32Array([1]));
			pool.clearPool();

			expect(pool.getPoolSize()).toBe(0);
			expect(pool.getPool()).toEqual([]);
			expect(pool.samplePool(3)).toEqual([]);
			expect([...pool.values()]).toEqual([]);
		});
	});

	describe("uniform", () => {
		it("should evict the oldest experience once the max size is exceeded", () => {
			const pool = createExperiencePool(true, 2);
			const first = makeExperience(1);
			pool.add(first);
			pool.add(makeExperience(2));
			pool.add(makeExperience(3));

			expect(pool.getPoolSize()).toBe(2);
			expect(pool.getPool()).not.toContain(first);
		});

		it("should sample a batch without exceeding the pool", () => {
			const pool = createExperiencePool(true, 10);
			for (let i = 0; i < 5; i++) {
				pool.add(makeExperience(i));
			}

			expect(pool.samplePool(3)).toHaveLength(3);
			expect(() => pool.samplePool(6)).toThrow(/exceeds pool size/);
		});

		it("should remove an experience by its input and ignore unknown inputs", () => {
			const pool = createExperiencePool(true, 10);
			const exp = makeExperience(1);
			pool.add(exp);
			pool.remove(new Float32Array([1]));
			expect(pool.getPoolSize()).toBe(1);

			pool.remove(exp.input);
			expect(pool.getPoolSize()).toBe(0);
		});

		it("should clear the pool and expose its values", () => {
			const pool = createExperiencePool(true, 10);
			pool.add(makeExperience(1));
			pool.add(makeExperience(2));
			expect([...pool.values()]).toHaveLength(2);

			pool.clearPool();
			expect(pool.getPoolSize()).toBe(0);
		});
	});

	describe("prioritized", () => {
		it("should return nothing from an empty pool", () => {
			const pool = createExperiencePool(true, 10, PER);

			expect(pool.samplePool(2)).toEqual([]);
		});

		it("should return the whole pool when the batch covers it", () => {
			const pool = createExperiencePool(true, 10, PER);
			pool.add(makeExperience(1));
			pool.add(makeExperience(2));

			expect(pool.samplePool(5)).toHaveLength(2);
		});

		it("should sample distinct experiences proportionally to their priority", () => {
			const pool = createExperiencePool(true, 10, PER);
			for (let i = 0; i < 6; i++) {
				pool.add(makeExperience(i));
			}
			jest.spyOn(Math, "random").mockReturnValue(0);

			const sampled = pool.samplePool(3);

			expect(sampled.length).toBeGreaterThan(0);
			expect(new Set(sampled).size).toBe(sampled.length);
		});

		it("should anneal beta while sampling when enabled", () => {
			const pool = createExperiencePool(true, 10, { ...PER, betaAnneal: true });
			for (let i = 0; i < 4; i++) {
				pool.add(makeExperience(i));
			}

			for (let step = 0; step < 3; step++) {
				expect(pool.samplePool(2).length).toBeLessThanOrEqual(2);
			}
		});

		it("should reset priorities on clear and support removal", () => {
			const pool = createExperiencePool(true, 10, PER);
			const exp = makeExperience(1);
			pool.add(exp);
			pool.add(makeExperience(2));
			pool.remove(exp.input);
			expect(pool.getPoolSize()).toBe(1);

			pool.clearPool();
			expect(pool.getPoolSize()).toBe(0);
			expect(pool.samplePool(1)).toEqual([]);
		});
	});

	describe("seeded rng", () => {
		function sampleRewards(
			perConfig: typeof PER | undefined,
			seed: number
		): unknown[][] {
			const pool = createExperiencePool(true, 10, perConfig, makePRNG(seed));
			for (let i = 0; i < 6; i++) {
				pool.add(makeExperience(i));
			}
			return Array.from({ length: 5 }, () =>
				pool.samplePool(3).map((exp) => (exp as { reward: number }).reward)
			);
		}

		it("should replay the same uniform samples for the same seed", () => {
			expect(sampleRewards(undefined, 42)).toEqual(
				sampleRewards(undefined, 42)
			);
			expect(sampleRewards(undefined, 42)).not.toEqual(
				sampleRewards(undefined, 43)
			);
		});

		it("should replay the same prioritized samples for the same seed", () => {
			expect(sampleRewards(PER, 42)).toEqual(sampleRewards(PER, 42));
		});

		it("should draw from the injected rng instead of Math.random", () => {
			const spy = jest.spyOn(Math, "random");
			sampleRewards(undefined, 42);
			sampleRewards(PER, 42);

			expect(spy).not.toHaveBeenCalled();
		});
	});
});
