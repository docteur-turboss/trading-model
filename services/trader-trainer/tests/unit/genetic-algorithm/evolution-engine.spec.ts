import { beforeEach, describe, expect, it } from "@jest/globals";
import {
	crossoverGenomes,
	crossoverWeights,
	mutateGenome,
	mutateWeights,
	selectParent,
} from "../../../src/core/genetic-algorithm/evolution-engine";
import { createDefaultGenome } from "../../../src/core/genetic-algorithm/factory";

describe("EvolutionEngine", () => {
	let rng: () => number;

	beforeEach(() => {
		rng = Math.random;
	});

	describe("crossoverWeights", () => {
		it("should produce output of same length as inputs", () => {
			const wa = new Float32Array([0.1, 0.2, 0.3, 0.4]);
			const wb = new Float32Array([0.5, 0.6, 0.7, 0.8]);
			const result = crossoverWeights(wa, wb, rng);
			expect(result.length).toBe(4);
		});

		it("should return a copy of wa when lengths differ", () => {
			const wa = new Float32Array([0.1, 0.2, 0.3]);
			const wb = new Float32Array([0.5, 0.6]);
			const result = crossoverWeights(wa, wb, rng);
			expect(result).toEqual(wa);
			expect(result).not.toBe(wa);
		});

		it("should return all from parent a when rng always returns < 0.5", () => {
			const rngAlwaysZero = () => 0;
			const wa = new Float32Array([0.1, 0.2]);
			const wb = new Float32Array([0.5, 0.6]);
			const result = crossoverWeights(wa, wb, rngAlwaysZero);
			expect(result[0]).toBeCloseTo(0.1);
			expect(result[1]).toBeCloseTo(0.2);
		});

		it("should return all from parent b when rng always returns >= 0.5", () => {
			const rngAlwaysOne = () => 0.7;
			const wa = new Float32Array([0.1, 0.2]);
			const wb = new Float32Array([0.5, 0.6]);
			const result = crossoverWeights(wa, wb, rngAlwaysOne);
			expect(result[0]).toBeCloseTo(0.5);
			expect(result[1]).toBeCloseTo(0.6);
		});

		it("should mix weights from both parents", () => {
			let callCount = 0;
			const alternatingRng = () => {
				callCount++;
				return callCount % 2 === 0 ? 0.3 : 0.7;
			};

			const wa = new Float32Array([0.1, 0.2, 0.3]);
			const wb = new Float32Array([0.4, 0.5, 0.6]);
			const result = crossoverWeights(wa, wb, alternatingRng);
			expect(result[0]).toBeCloseTo(0.4);
			expect(result[1]).toBeCloseTo(0.2);
			expect(result[2]).toBeCloseTo(0.6);
		});
	});

	describe("mutateWeights", () => {
		it("should return an array of same length", () => {
			const w = new Float32Array([0.1, 0.2, 0.3]);
			const result = mutateWeights(w, 0.5, 0.1, rng);
			expect(result.length).toBe(3);
		});

		it("should not mutate when rate is 0", () => {
			const w = new Float32Array([0.1, 0.2, 0.3]);
			const result = mutateWeights(w, 0, 0.1, rng);
			expect(result[0]).toBeCloseTo(0.1);
			expect(result[1]).toBeCloseTo(0.2);
			expect(result[2]).toBeCloseTo(0.3);
		});

		it("should return a new array (not same reference)", () => {
			const w = new Float32Array([0.1, 0.2, 0.3]);
			const result = mutateWeights(w, 0, 0.1, rng);
			expect(result).not.toBe(w);
		});

		it("should mutate weights when rng < rate", () => {
			const w = new Float32Array([1, 1, 1]);
			const result = mutateWeights(w, 0.6, 0.05, () => 0.3);
			const allMutated = result[0] !== 1 || result[1] !== 1 || result[2] !== 1;
			expect(allMutated).toBe(true);
		});
	});

	describe("mutateGenome", () => {
		it("should return a shallow copy of the genome", () => {
			const genome = createDefaultGenome("test");
			const result = mutateGenome(genome);
			expect(result).not.toBe(genome);
			expect(result.id).toBe("test");
			expect(result.rl.gamma).toBe(genome.rl.gamma);
		});
	});

	describe("crossoverGenomes", () => {
		it("should return a shallow copy of the first parent", () => {
			const pA = createDefaultGenome("parentA");
			const result = crossoverGenomes(pA);
			expect(result).not.toBe(pA);
			expect(result.id).toBe("parentA");
			expect(result.rl.gamma).toBe(pA.rl.gamma);
		});
	});

	describe("selectParent", () => {
		it("should select a parent from population", () => {
			const population = [
				createDefaultGenome("p1"),
				createDefaultGenome("p2"),
				createDefaultGenome("p3"),
			];
			population[0].fitness = 10;
			population[1].fitness = 20;
			population[2].fitness = 30;

			const parent = selectParent(population, "tournament", rng);
			expect(parent).toBeDefined();
		});

		it("should return a member of the population", () => {
			const population = [createDefaultGenome("p1")];
			const parent = selectParent(population, "tournament", rng);
			expect(parent).toBe(population[0]);
		});

		it("should work with random selection type", () => {
			const population = [createDefaultGenome("p1"), createDefaultGenome("p2")];
			const parent = selectParent(population, "unknown-type", rng);
			expect(population).toContain(parent);
		});

		it("should pick a candidate with higher fitness over a lower one", () => {
			const population = [
				createDefaultGenome("low"),
				createDefaultGenome("high"),
				createDefaultGenome("mid"),
			];
			population[0].fitness = -100;
			population[1].fitness = 100;
			population[2].fitness = 0;
			let callCount = 0;
			const controlledRng = () => {
				callCount++;
				if (callCount === 1) {
					return 0; // best = index 0 (fitness -100)
				}
				if (callCount === 2) {
					return 0.3334; // cand = index 1 (fitness 100)
				}
				return 0;
			};
			const parent = selectParent(population, "tournament", controlledRng);
			expect(parent.id).toBe("high");
		});

		it("should handle all undefined fitnesses", () => {
			const population = [
				createDefaultGenome("a"),
				createDefaultGenome("b"),
				createDefaultGenome("c"),
			];
			// All fitnesses are undefined — ?? -Infinity makes every comparison false,
			// so the first selected candidate always wins.
			let callCount = 0;
			const controlledRng = () => {
				callCount++;
				if (callCount === 1) {
					return 0.0; // best = index 0 (id='a')
				}
				if (callCount === 2) {
					return 0.5; // cand = index 1 (id='b'), but -Inf > -Inf is false
				}
				if (callCount === 3) {
					return 0.99; // cand = index 2 (id='c'), same
				}
				return 0;
			};
			const parent = selectParent(population, "tournament", controlledRng);
			expect(parent.id).toBe("a");
		});
	});
});
