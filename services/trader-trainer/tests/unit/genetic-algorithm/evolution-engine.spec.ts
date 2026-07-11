import { beforeEach, describe, expect, it } from "@jest/globals";
import { EpisodeScores } from "../../../src/core/genetic-algorithm/episode-scores";
import {
	crossoverGenomes,
	crossoverWeights,
	mutateGenome,
	mutateWeights,
} from "../../../src/core/genetic-algorithm/evolution-engine";
import { createDefaultGenome } from "../../../src/core/genetic-algorithm/factory";
import { SelectionType } from "../../../src/core/genetic-algorithm/genome";
import type { PopMember } from "../../../src/core/genetic-algorithm/genome-types";
import { selectParent } from "../../../src/core/genetic-algorithm/selection";

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
			const result = mutateWeights({ weights: w, rate: 0.5, std: 0.1, rng });
			expect(result.length).toBe(3);
		});

		it("should not mutate when rate is 0", () => {
			const w = new Float32Array([0.1, 0.2, 0.3]);
			const result = mutateWeights({ weights: w, rate: 0, std: 0.1, rng });
			expect(result[0]).toBeCloseTo(0.1);
			expect(result[1]).toBeCloseTo(0.2);
			expect(result[2]).toBeCloseTo(0.3);
		});

		it("should return a new array (not same reference)", () => {
			const w = new Float32Array([0.1, 0.2, 0.3]);
			const result = mutateWeights({ weights: w, rate: 0, std: 0.1, rng });
			expect(result).not.toBe(w);
		});

		it("should mutate weights when rng < rate", () => {
			const w = new Float32Array([1, 1, 1]);
			const result = mutateWeights({
				weights: w,
				rate: 0.6,
				std: 0.05,
				rng: () => 0.3,
			});
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
		function makePop(fitnesses: number[]): PopMember[] {
			return fitnesses.map((fitness, i) => ({
				genome: createDefaultGenome(`g${i}`, 1),
				fitness,
				fitnessMeta: {
					episodesRun: 3,
					computeMs: 100,
					efficiencyScore: fitness,
					variance: 0.1,
					rawScores: new EpisodeScores([fitness]),
				},
			}));
		}

		it("should select a parent from population", () => {
			const population = makePop([10, 20, 30]);
			const parent = selectParent(population, SelectionType.Tournament, rng);
			expect(parent).toBeDefined();
		});

		it("should return a member of the population", () => {
			const population = makePop([10]);
			const parent = selectParent(population, SelectionType.Tournament, rng);
			expect(parent).toBe(population[0].genome);
		});

		it("should work with random selection type", () => {
			const population = makePop([10, 20]);
			const parent = selectParent(
				population,
				"unknown-type" as SelectionType,
				rng
			);
			expect(population.map((m) => m.genome)).toContain(parent);
		});

		it("should pick a candidate with higher fitness over a lower one", () => {
			const population = [
				{
					genome: createDefaultGenome("low"),
					fitness: -100,
					fitnessMeta: {
						episodesRun: 3,
						computeMs: 100,
						efficiencyScore: -100,
						variance: 0,
						rawScores: new EpisodeScores([-100]),
					},
				},
				{
					genome: createDefaultGenome("high"),
					fitness: 100,
					fitnessMeta: {
						episodesRun: 3,
						computeMs: 100,
						efficiencyScore: 100,
						variance: 0,
						rawScores: new EpisodeScores([100]),
					},
				},
				{
					genome: createDefaultGenome("mid"),
					fitness: 0,
					fitnessMeta: {
						episodesRun: 3,
						computeMs: 100,
						efficiencyScore: 0,
						variance: 0,
						rawScores: new EpisodeScores([0]),
					},
				},
			];
			let callCount = 0;
			const controlledRng = () => {
				callCount++;
				if (callCount === 1) {
					return 0;
				}
				if (callCount === 2) {
					return 0.3334;
				}
				return 0;
			};
			const parent = selectParent(
				population,
				SelectionType.Tournament,
				controlledRng
			);
			expect(parent.id).toBe("high");
		});
	});
});
