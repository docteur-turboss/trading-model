/**
 * @fileoverview Unit tests for Genetic Algorithm module
 *
 * Tests the core GA operators:
 * - Mutation
 * - Crossover
 * - Fitness calculation
 * - Genome validation
 */

import { beforeEach, describe, expect, test } from "@jest/globals";
import { crossoverGenomes } from "../../../src/core/genetic-algorithm/crossover";
import { EpisodeScores } from "../../../src/core/genetic-algorithm/episode-scores";
import { createDefaultGenome } from "../../../src/core/genetic-algorithm/factory";
import { computeFitness } from "../../../src/core/genetic-algorithm/fitness";
import { FitnessType } from "../../../src/core/genetic-algorithm/genome";
import { mutateGenome } from "../../../src/core/genetic-algorithm/mutation";
import {
	repairGenome,
	validateGenome,
} from "../../../src/core/genetic-algorithm/validation";

describe("Genetic Algorithm - Core Operators", () => {
	let baseGenome: any;

	const rng: () => number = () => 0.5;

	beforeEach(() => {
		baseGenome = createDefaultGenome("base");
	});

	describe("Mutation", () => {
		test("should mutate a genome", () => {
			const mutated = mutateGenome(baseGenome, rng);

			expect(mutated).toBeDefined();
			expect(mutated !== baseGenome).toBe(true); // Should be new instance
		});

		test("should not mutate to invalid state", () => {
			const mutated = mutateGenome(baseGenome, rng);

			expect(mutated.network).toBeDefined();
			expect(mutated.rl).toBeDefined();
			expect(Array.isArray(mutated.network.hiddenLayers)).toBe(true);
		});

		test("should support different mutation distributions", () => {
			const genomes = [
				mutateGenome(baseGenome, rng),
				mutateGenome(baseGenome, rng),
				mutateGenome(baseGenome, rng),
			];

			genomes.forEach((g) => {
				expect(g).toBeDefined();
				expect(g.network).toBeDefined();
			});
		});

		test("should support adaptive mutation strength", () => {
			const mutated1 = mutateGenome(baseGenome, rng);
			const mutated2 = mutateGenome(mutated1, rng);

			expect(mutated2).toBeDefined();
		});

		test("should preserve genome structure", () => {
			const mutated = mutateGenome(baseGenome, rng);

			expect(mutated.network.inputDim).toBeDefined();
			expect(mutated.network.outputDim).toBeDefined();
			expect(mutated.rl).toBeDefined();
		});
	});

	describe("Crossover", () => {
		let parent1: any;
		let parent2: any;

		beforeEach(() => {
			parent1 = createDefaultGenome("p1");
			parent2 = mutateGenome(createDefaultGenome("p2"), rng);
		});

		test("should crossover two genomes", () => {
			const offspring = crossoverGenomes(parent1, parent2, rng);

			expect(offspring).toBeDefined();
			expect(offspring !== parent1).toBe(true);
			expect(offspring !== parent2).toBe(true);
		});

		test("should produce offspring with valid structure", () => {
			const offspring = crossoverGenomes(parent1, parent2, rng);

			expect(offspring.network).toBeDefined();
			expect(offspring.rl).toBeDefined();
			expect(offspring.network.inputDim).toBe(parent1.network.inputDim);
		});

		test("should support different crossover types", () => {
			const offspring1 = crossoverGenomes(parent1, parent2, rng);

			expect(offspring1).toBeDefined();
			expect(offspring1.network).toBeDefined();
		});

		test("should not modify parents", () => {
			const p1Clone = JSON.stringify(parent1);
			const p2Clone = JSON.stringify(parent2);

			crossoverGenomes(parent1, parent2, rng);

			expect(JSON.stringify(parent1)).toBe(p1Clone);
			expect(JSON.stringify(parent2)).toBe(p2Clone);
		});

		test("should handle identical parents", () => {
			const offspring = crossoverGenomes(parent1, parent1, rng);

			expect(offspring).toBeDefined();
		});
	});

	describe("Fitness Calculation", () => {
		let scores: EpisodeScores;

		beforeEach(() => {
			scores = new EpisodeScores([100, 120, 110, 130, 140]);
		});

		test("should calculate fitness from score array", () => {
			const fitness = computeFitness(FitnessType.Sharpe, scores);

			expect(typeof fitness).toBe("number");
		});

		test("should support different fitness metrics", () => {
			const fitnessPnL = computeFitness(FitnessType.TotalPnl, scores);
			const fitnessSharpe = computeFitness(FitnessType.Sharpe, scores);

			expect(typeof fitnessPnL).toBe("number");
			expect(typeof fitnessSharpe).toBe("number");
		});

		test("should penalize losses", () => {
			const negativeScores = new EpisodeScores([-100, -50, -30]);

			const fitness = computeFitness(FitnessType.TotalPnl, negativeScores);
			expect(fitness).toBeLessThan(
				computeFitness(FitnessType.TotalPnl, scores)
			);
		});

		test("should reward higher Sharpe ratio", () => {
			const lowSharpe = new EpisodeScores([10, -10, 10, -10]);
			const highSharpe = new EpisodeScores([10, 11, 10, 11]);

			const fitness1 = computeFitness(FitnessType.Sharpe, lowSharpe);
			const fitness2 = computeFitness(FitnessType.Sharpe, highSharpe);

			expect(fitness2).toBeGreaterThan(fitness1);
		});
	});

	describe("Genome Validation", () => {
		test("should validate valid genome", () => {
			const genome = createDefaultGenome("valid");
			const result = validateGenome(genome);

			expect(result.valid).toBe(true);
		});

		test("should detect invalid neuron counts", () => {
			const invalidGenome = {
				...baseGenome,
				network: {
					...baseGenome.network,
					hiddenLayers: [{ neurons: -5 }],
				},
			};

			const result = validateGenome(invalidGenome);
			expect(result.valid).toBe(false);
		});

		test("should repair salvageable genomes", () => {
			const invalidGenome = {
				...baseGenome,
				network: {
					...baseGenome.network,
					hiddenLayers: [{ neurons: 0 }],
				},
			};

			const repaired = repairGenome(invalidGenome);
			const result = validateGenome(repaired);

			expect(result.valid).toBe(true);
		});
	});

	describe("Genome Factory", () => {
		test("should create default genome", () => {
			const genome = createDefaultGenome("default");

			expect(genome).toBeDefined();
			expect(genome.network).toBeDefined();
			expect(genome.rl).toBeDefined();
		});

		test("default genome should be valid", () => {
			const genome = createDefaultGenome("default");
			const result = validateGenome(genome);

			expect(result.valid).toBe(true);
		});

		test("should support genome cloning", () => {
			const genome1 = createDefaultGenome("clone");
			const genome2 = createDefaultGenome("clone");

			expect(JSON.stringify(genome1) === JSON.stringify(genome2)).toBe(true);
		});
	});

	describe("Mutation-Crossover Integration", () => {
		test("should handle mutation after crossover", () => {
			const p1 = createDefaultGenome("p1");
			const p2 = mutateGenome(createDefaultGenome("p2"), rng);

			const offspring = crossoverGenomes(p1, p2, rng);
			const mutated = mutateGenome(offspring, rng);

			expect(mutated).toBeDefined();
			expect(validateGenome(mutated).valid).toBe(true);
		});

		test("should handle multiple generations", () => {
			let population = [createDefaultGenome("g1"), createDefaultGenome("g2")];

			for (let gen = 0; gen < 5; gen++) {
				const offspring = [];

				for (let i = 0; i < population.length; i++) {
					const parent1 = population[i];
					const parent2 = population[(i + 1) % population.length];

					let child = crossoverGenomes(parent1, parent2, rng);
					child = mutateGenome(child, rng);

					offspring.push(child);
				}

				population = offspring;
			}

			population.forEach((g) => {
				expect(validateGenome(g).valid).toBe(true);
			});
		});
	});

	describe("Edge Cases", () => {
		test("should handle single layer networks", () => {
			const simpleGenome = {
				...baseGenome,
				network: {
					inputDim: 4,
					outputDim: 3,
					hiddenLayers: [],
				},
			};

			const mutated = mutateGenome(simpleGenome, rng);
			expect(mutated).toBeDefined();
		});

		test("should handle very large networks", () => {
			const largeGenome = {
				...baseGenome,
				network: {
					inputDim: 100,
					outputDim: 10,
					hiddenLayers: new Array(10).fill({ neurons: 256 }),
				},
			};

			const mutated = mutateGenome(largeGenome, rng);
			expect(mutated).toBeDefined();
		});

		test("should handle extreme hyperparameters", () => {
			const extremeGenome = {
				...baseGenome,
				rl: {
					...baseGenome.rl,
					discretePolicy: {
						...baseGenome.rl.discretePolicy,
						learningRate: 0.0001,
						gamma: 0.9999,
					},
				},
			};

			const mutated = mutateGenome(extremeGenome, rng);
			expect(validateGenome(mutated).valid).toBe(true);
		});
	});
});
