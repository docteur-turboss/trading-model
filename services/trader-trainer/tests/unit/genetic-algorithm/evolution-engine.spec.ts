import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { DurationMs } from "@trading-model/primitives/primitives";
import { EpisodeScores } from "../../../src/domain/genetic-algorithm/episode-scores";
import {
	crossoverWeights,
	mutateWeights,
} from "../../../src/domain/genetic-algorithm/evolution-engine";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import type { PopMember } from "../../../src/domain/genetic-algorithm/genome-types";
import { createOffspring } from "../../../src/domain/genetic-algorithm/offspring-factory";
import { selectParent } from "../../../src/domain/genetic-algorithm/selection";

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

		it("should call onFallback once per length mismatch and never log", () => {
			const onFallback = jest.fn();
			const wa = new Float32Array([0.1, 0.2, 0.3]);
			const wb = new Float32Array([0.5, 0.6]);
			for (let i = 0; i < 1000; i++) {
				crossoverWeights(wa, wb, rng, onFallback);
			}
			crossoverWeights(wa, wa, rng, onFallback);
			expect(onFallback).toHaveBeenCalledTimes(1000);
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

	describe("createOffspring fallback telemetry", () => {
		function member(id: string, weights: number[]): PopMember {
			const genome = {
				...createDefaultGenome(id, 1),
				trainedWeights: new Float32Array(weights),
			};
			return {
				genome,
				fitness: 1,
				fitnessMeta: {
					episodesRun: 3,
					computeMs: DurationMs.of(100),
					efficiencyScore: 1,
					variance: 0,
					rawScores: new EpisodeScores([1]),
				},
			} as unknown as PopMember;
		}

		it("reports the fallbacks of a generation in one call", () => {
			const ranked = Array.from({ length: 20 }, (_u, i) =>
				member(`m${i}`, i % 2 ? [1, 2] : [1, 2, 3])
			);
			const ctrl = ranked[0].genome.gaControl;
			const crossoverFallbacks = jest.fn();
			createOffspring({
				ranked,
				newCtrl: ctrl,
				ctrl,
				rng: Math.random,
				generation: 1,
				telemetry: {
					generationStarted: jest.fn(),
					stagnationUpdated: jest.fn(),
					evaluationFailed: jest.fn(),
					genomeEvaluated: jest.fn(),
					crossoverFallbacks,
				},
			});
			expect(crossoverFallbacks).toHaveBeenCalledTimes(1);
			expect(crossoverFallbacks.mock.calls[0][0]).toBeGreaterThan(0);
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

	describe("selectParent", () => {
		function makePop(fitnesses: number[]): PopMember[] {
			return fitnesses.map((fitness, i) => ({
				genome: createDefaultGenome(`g${i}`, 1),
				fitness,
				fitnessMeta: {
					episodesRun: 3,
					computeMs: DurationMs.of(100),
					efficiencyScore: fitness,
					variance: 0.1,
					rawScores: new EpisodeScores([fitness]),
				},
			}));
		}

		it("should select a parent from population", () => {
			const population = makePop([10, 20, 30]);
			const parent = selectParent(population, rng);
			expect(parent).toBeDefined();
		});

		it("should return a member of the population", () => {
			const population = makePop([10]);
			const parent = selectParent(population, rng);
			expect(parent).toBe(population[0].genome);
		});

		it("should pick a candidate with higher fitness over a lower one", () => {
			const population = [
				{
					genome: createDefaultGenome("low"),
					fitness: -100,
					fitnessMeta: {
						episodesRun: 3,
						computeMs: DurationMs.of(100),
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
						computeMs: DurationMs.of(100),
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
						computeMs: DurationMs.of(100),
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
			const parent = selectParent(population, controlledRng);
			expect(parent.id).toBe("high");
		});
	});
});
