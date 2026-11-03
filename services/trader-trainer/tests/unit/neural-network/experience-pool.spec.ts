import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { makePRNG } from "../../../src/domain/genetic-algorithm/prng";
import {
	createExperiencePool,
	createPrioritizedExperiencePool,
	type IPrioritizedExperiencePool,
	type PerConfig,
} from "../../../src/domain/neural-network/experience-pool";
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
		const ALPHA = 0.6;
		const TD_ERRORS = [1, 2, 3, 4];

		function makePerPool(
			overrides: Partial<PerConfig> = {},
			seed = 7
		): { pool: IPrioritizedExperiencePool; ids: number[] } {
			const pool = createPrioritizedExperiencePool(
				100,
				{ alpha: ALPHA, beta: 0.4, betaAnneal: false, ...overrides },
				makePRNG(seed)
			);
			TD_ERRORS.forEach((_, value) => {
				pool.add(makeExperience(value));
			});
			const ids = [0, 1, 2, 3];
			pool.updatePriorities(ids, TD_ERRORS);
			return { pool, ids };
		}

		/** P(i) = p_i^α / Σ p^α with p_i = |δ_i| + ε, computed independently. */
		function expectedProbabilities(alpha: number): number[] {
			const scaled = TD_ERRORS.map((err) => (Math.abs(err) + 1e-6) ** alpha);
			const total = scaled.reduce((acc, val) => acc + val, 0);
			return scaled.map((val) => val / total);
		}

		/** w_i = (N·P(i))^-β normalised by the least likely experience. */
		function expectedWeight(id: number, beta: number, alpha = ALPHA): number {
			const probs = expectedProbabilities(alpha);
			const minProb = Math.min(...probs);
			return (probs[id] / minProb) ** -beta;
		}

		function frequencies(ids: number[]): number[] {
			const counts = [0, 0, 0, 0];
			for (const id of ids) {
				counts[id]++;
			}
			return counts.map((count) => count / ids.length);
		}

		it("should return an empty sample from an empty pool", () => {
			const pool = createPrioritizedExperiencePool(10, PER, makePRNG(1));

			expect(pool.sampleWithWeights(3)).toEqual({
				experiences: [],
				ids: [],
				weights: new Float32Array(0),
			});
			expect(pool.samplePool(2)).toEqual([]);
		});

		it("should draw a full batch with replacement, even beyond the pool size", () => {
			const pool = createExperiencePool(true, 10, PER, makePRNG(1));
			pool.add(makeExperience(1));
			pool.add(makeExperience(2));

			expect(pool.samplePool(5)).toHaveLength(5);
		});

		it("should sample uniformly while every priority is the initial one", () => {
			const pool = createPrioritizedExperiencePool(100, PER, makePRNG(5));
			for (let i = 0; i < 4; i++) {
				pool.add(makeExperience(i));
			}

			const { ids, weights } = pool.sampleWithWeights(10_000);

			for (const freq of frequencies(ids)) {
				expect(Math.abs(freq - 0.25)).toBeLessThan(0.015);
			}
			expect([...weights].every((weight) => weight === 1)).toBe(true);
		});

		it("should sample with frequency p_i^α / Σ p^α over 10 000 draws", () => {
			const { pool } = makePerPool();

			const { ids } = pool.sampleWithWeights(10_000);

			const expected = expectedProbabilities(ALPHA);
			frequencies(ids).forEach((freq, id) => {
				// ±3σ of a binomial proportion over 10 000 draws is below 0.014.
				expect(Math.abs(freq - expected[id])).toBeLessThan(0.015);
			});
		});

		it("should ignore priorities when α is 0", () => {
			const { pool } = makePerPool({ alpha: 0 });

			const { ids } = pool.sampleWithWeights(10_000);

			for (const freq of frequencies(ids)) {
				expect(Math.abs(freq - 0.25)).toBeLessThan(0.015);
			}
		});

		it("should return exact importance-sampling weights", () => {
			const { pool } = makePerPool();

			const { ids, weights, experiences } = pool.sampleWithWeights(50);

			expect(new Set(ids).size).toBe(4);
			ids.forEach((id, idx) => {
				expect(weights[idx]).toBeCloseTo(expectedWeight(id, 0.4), 6);
				expect(experiences[idx].input[0]).toBe(id);
			});
			expect(Math.max(...weights)).toBeCloseTo(1, 6);
		});

		it("should keep beta fixed without annealing", () => {
			const { pool } = makePerPool();

			for (let call = 0; call < 3; call++) {
				const { ids, weights } = pool.sampleWithWeights(20);
				expect(weights[0]).toBeCloseTo(expectedWeight(ids[0], 0.4), 6);
			}
		});

		it("should anneal beta linearly up to 1", () => {
			const { pool } = makePerPool({ betaAnneal: true, betaAnnealRate: 0.1 });

			for (let call = 0; call < 9; call++) {
				const beta = Math.min(1, 0.4 + 0.1 * call);
				const { ids, weights } = pool.sampleWithWeights(20);
				ids.forEach((id, idx) => {
					expect(weights[idx]).toBeCloseTo(expectedWeight(id, beta), 6);
				});
			}
		});

		it("should anneal by 1e-4 per sample by default", () => {
			const { pool } = makePerPool({ betaAnneal: true });
			pool.sampleWithWeights(1);

			const { ids, weights } = pool.sampleWithWeights(20);

			expect(weights[0]).toBeCloseTo(expectedWeight(ids[0], 0.4001), 6);
		});

		it("should use |δ| so that negative TD errors weigh like positive ones", () => {
			const { pool, ids } = makePerPool();
			pool.updatePriorities(ids, [-1, -2, -3, -4]);

			const sample = pool.sampleWithWeights(30);

			sample.ids.forEach((id, idx) => {
				expect(sample.weights[idx]).toBeCloseTo(expectedWeight(id, 0.4), 6);
			});
		});

		it("should keep a zero TD error sampleable through ε", () => {
			const pool = createPrioritizedExperiencePool(10, PER, makePRNG(2));
			pool.add(makeExperience(0));
			pool.add(makeExperience(1));
			pool.updatePriorities([0, 1], [0, 0]);

			const { ids } = pool.sampleWithWeights(1_000);

			expect(new Set(ids)).toEqual(new Set([0, 1]));
		});

		it("should give new experiences the highest priority seen so far", () => {
			const { pool } = makePerPool();
			pool.add(makeExperience(4));

			const { ids, weights } = pool.sampleWithWeights(200);

			const weightOf = (id: number) => weights[ids.indexOf(id)];
			expect(weightOf(4)).toBeCloseTo(weightOf(3), 6);
		});

		it("should ignore unknown ids and reject mismatched TD errors", () => {
			const { pool } = makePerPool();

			expect(() => pool.updatePriorities([99], [5])).not.toThrow();
			expect(() => pool.updatePriorities([0, 1], [1])).toThrow(/2 experiences/);
		});

		it("should forget the priority of evicted and removed experiences", () => {
			const pool = createPrioritizedExperiencePool(2, PER, makePRNG(3));
			const evicted = makeExperience(0);
			const removed = makeExperience(1);
			pool.add(evicted);
			pool.add(removed);
			pool.updatePriorities([0, 1], [100, 100]);
			pool.add(makeExperience(2));
			pool.add(makeExperience(3));
			pool.remove(removed.input);

			const { ids, weights } = pool.sampleWithWeights(100);

			expect(new Set(ids)).toEqual(new Set([2, 3]));
			expect([...weights].every((weight) => weight === 1)).toBe(true);
		});

		it("should reset priorities on clear", () => {
			const { pool } = makePerPool();

			pool.clearPool();
			pool.add(makeExperience(0));
			pool.add(makeExperience(1));

			const { weights } = pool.sampleWithWeights(10);
			expect(pool.getPoolSize()).toBe(2);
			expect([...weights].every((weight) => weight === 1)).toBe(true);
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
