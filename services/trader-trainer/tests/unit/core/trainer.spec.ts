import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
	ActivationType,
	ConnectionType,
	ContinuousPolicyType,
	CrossoverType,
	DiscretePolicyType,
	FitnessType,
	InitialisationType,
	MutationAdaptation,
	MutationDistribution,
	MutationScope,
	NormalisationType,
	SelectionType,
} from "../../../src/core/genetic-algorithm/genome";
import { createBounded } from "../../../src/core/genetic-algorithm/bounded";
import type { LamarckGenome } from "../../../src/core/genetic-algorithm/genome-types";
import type { DeepReadonly } from "../../../src/core/genetic-algorithm/shared-types";
import { MarketDataBuffer } from "../../../src/core/market-data-buffer";
import {
	makeBestGenomeNoMeta,
	makeMinimalBestGenome,
	makeMinimalFitnessMeta,
} from "../../fixtures/genome.fixture";
import { feedCandles } from "../../fixtures/market-data.fixture";

jest.mock<{ ENV: any }>("../../../src/config/env", () => ({
	ENV: {
		TRAINER_SYMBOLS: "BTCUSDT",
		TRAINER_DATA_WINDOW: 500,
		TRAINER_VALIDATION_SPLIT: 0.2,
		TRAINER_GENERATIONS: 10,
		TRAINER_POPULATION_SIZE: 5,
		TRAINER_TIME_BUDGET_MS: 60000,
		TRAINER_EPISODES_PER_INDIVIDUAL: 2,
	},
}));

let capturedOnGeneration: ((ctx: any) => void) | null = null;
let capturedOnArchiveUpdate: ((archive: any[]) => void) | null = null;
let mockRunImpl: (() => Promise<any>) | null = null;
let mockArchiveData: any[] = [{ id: "best-archived" }];

jest.mock("../../../src/core/genetic-algorithm/ga-runner", () => {
	const mockRunner = {
		run: jest.fn<() => Promise<any>>().mockImplementation(() => {
			if (capturedOnGeneration) {
				capturedOnGeneration({
					generation: 1,
					bestFitness: 1.5,
					avgFitness: 1.0,
					archive: [{}],
					stagnation: 0,
					elapsedMs: 1000,
					bestGenome: { id: "gen-1" },
				});
			}
			if (capturedOnArchiveUpdate) {
				capturedOnArchiveUpdate(mockArchiveData);
			}
			if (mockRunImpl) {
				return mockRunImpl();
			}
			return Promise.resolve({
				id: "mock-result",
				fitness: 2.0,
				generation: 1,
				gaControl: {
					populationSize: 20,
					elitismFraction: 0.1,
					survivorFraction: 0.5,
					episodesPerIndividual: 3,
					selectionType: SelectionType.Tournament,
					fitnessType: FitnessType.TotalPnl,
				},
				network: {
					inputDim: 32,
					outputDim: 3,
					hiddenLayers: [
						{
							neurons: 64,
							activation: ActivationType.Relu,
							connectionType: ConnectionType.DenseSkip,
							biasType: InitialisationType.Zeros,
						},
					],
					normalization: NormalisationType.None,
				},
				rl: {
					gamma: 0.99,
					learningRate: 0.001,
					rewardShaping: {
						clip: false,
						clipBounds: createBounded(-1, 1),
						scale: false,
						scaleFactor: 1,
						normalize: false,
						sparse: false,
					},
					horizon: { maxEpisodeLength: 500, nStepReturn: 1, frameSkip: 1 },
					discretePolicy: {
						type: DiscretePolicyType.EpsilonGreedy,
						epsilonStart: 1.0,
						epsilonMin: 0.05,
						epsilonDecay: 0.995,
						temperature: 1.0,
					},
					continuousPolicy: {
						type: ContinuousPolicyType.TanhSquashing,
						clipBounds: createBounded(-1, 1),
						noiseStd: 0.1,
						noiseDecay: 0.999,
					},
					replayBuffer: {
						bufferSize: 10000,
						prioritized: false,
						alphaPER: 0.6,
						betaPER: 0.4,
						betaAnneal: true,
					},
				},
				mutation: {
					rate: 0.1,
					sigma: 0.05,
					noiseStd: 0.02,
					distribution: MutationDistribution.Gaussian,
					adaptation: MutationAdaptation.Fixed,
					scope: MutationScope.Global,
					selfSigma: 0.05,
					mutateActivations: false,
					activationMutationRate: 0.05,
					mutateHyperparams: true,
					addNeuronRate: 0.01,
					removeNeuronRate: 0.01,
					addLayerRate: 0.005,
					removeLayerRate: 0.005,
					addConnectionRate: 0.01,
					removeConnectionRate: 0.01,
				},
				crossover: {
					type: CrossoverType.Uniform,
					probability: 0.7,
					blendAlpha: 0.5,
					sbxEta: 2,
				},
			});
		}),
		getGeneration: jest.fn<() => number>().mockReturnValue(5),
	};
	return {
		GeneticAlgorithmRunner: jest.fn().mockImplementation((opts: any) => {
			capturedOnGeneration = opts.onGeneration || null;
			capturedOnArchiveUpdate = opts.onArchiveUpdate || null;
			return mockRunner;
		}),
		makeTradingAgentBackend: jest.fn(),
	};
});

describe("Trainer", () => {
	let dataBuffer: MarketDataBuffer;

	beforeEach(() => {
		dataBuffer = new MarketDataBuffer({ maxSize: 500 });
		capturedOnGeneration = null;
		capturedOnArchiveUpdate = null;
		mockRunImpl = null;
		mockArchiveData = [{ id: "best-archived" }];
	});

	describe("initial state", () => {
		it("should return null from getBestAgentSummary before training", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);

			const summary = trainer.getBestAgentSummary();

			expect(summary).toBeNull();
		});

		it("should return false from isTraining before training", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);

			expect(trainer.isTraining()).toBe(false);
		});

		it("should return 0 from getGeneration before training", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);

			expect(trainer.getGeneration()).toBe(0);
		});

		it("should return empty string from getCurrentSymbol before training", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);

			expect(trainer.getCurrentSymbol()).toBe("");
		});

		it("should return null from getGenerationContext before training", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);

			expect(trainer.getGenerationContext()).toBeNull();
		});
	});

	describe("train with insufficient data", () => {
		it("should return failure result with fewer than 10 steps", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			feedCandles(dataBuffer, "BTCUSDT", 5);

			const result = await trainer.train("BTCUSDT");

			expect(result.success).toBe(false);
			expect(trainer.isTraining()).toBe(false);
			expect(trainer.getBestAgentSummary()).toBeNull();
		});

		it("should not start training when train split has fewer than 10 steps after validation split", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			feedCandles(dataBuffer, "BTCUSDT", 11);

			const result = await trainer.train("BTCUSDT");

			expect(result.success).toBe(false);
			expect(trainer.isTraining()).toBe(false);
			expect(trainer.getBestAgentSummary()).toBeNull();
		});

		it("should return failure result if already training", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			feedCandles(dataBuffer, "BTCUSDT", 100);

			Object.defineProperty(trainer, "_training", {
				value: true,
				writable: false,
			});

			const result = await trainer.train("BTCUSDT");

			expect(result.success).toBe(false);
			expect(trainer.isTraining()).toBe(true);
		});
	});

	describe("train with sufficient data", () => {
		it("should return success result with enough data", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const result = await trainer.train("BTCUSDT");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.symbol).toBe("BTCUSDT");
				expect(result.bestGenome).toBeDefined();
			}
			expect(trainer.isTraining()).toBe(false);
		});

		it("should set currentSymbol after training", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			feedCandles(dataBuffer, "BTCUSDT", 100);

			await trainer.train("BTCUSDT");

			expect(trainer.getCurrentSymbol()).toBe("BTCUSDT");
		});

		it("should update getGeneration from runner", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			feedCandles(dataBuffer, "BTCUSDT", 100);

			await trainer.train("BTCUSDT");

			expect(trainer.getGeneration()).toBe(5);
		});

		it("should update bestGenome after successful training", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const result = await trainer.train("BTCUSDT");

			expect(result.success).toBe(true);
			const summary = trainer.getBestAgentSummary();
			expect(summary).not.toBeNull();
			expect(summary!.id).toBe("mock-result");
		});

		it("should return failure result with error details when training throws", async () => {
			mockRunImpl = () => {
				return Promise.reject(new Error("training error"));
			};
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const result = await trainer.train("BTCUSDT");

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.symbol).toBe("BTCUSDT");
				expect(result.error.message).toBe("training error");
			}
			expect(trainer.isTraining()).toBe(false);
		});

		it("should handle non-Error thrown by runner", async () => {
			mockRunImpl = () => {
				return Promise.reject(new Error("string error"));
			};
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const result = await trainer.train("BTCUSDT");

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.symbol).toBe("BTCUSDT");
				expect(result.error.message).toBe("string error");
			}
			expect(trainer.isTraining()).toBe(false);
		});

		it("should handle null fitness in training result", async () => {
			mockRunImpl = async () => ({ id: "no-fitness" });
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const result = await trainer.train("BTCUSDT");

			expect(result.success).toBe(true);
			expect(trainer.isTraining()).toBe(false);
		});
	});

	describe("computeSharpe", () => {
		it("should return 0 for empty scores array", async () => {
			const { Trainer } = await import("../../../src/core/trainer");

			const computeSharpe = (
				Trainer.prototype as unknown as Record<string, unknown>
			)._computeSharpe as (scores: number[]) => number;

			expect(computeSharpe([])).toBe(0);
		});

		it("should return 0 for single-element scores array", async () => {
			const { Trainer } = await import("../../../src/core/trainer");

			const computeSharpe = (
				Trainer.prototype as unknown as Record<string, unknown>
			)._computeSharpe as (scores: number[]) => number;

			expect(computeSharpe([1])).toBe(0);
		});

		it("should return mean when all scores are identical (std is zero)", async () => {
			const { Trainer } = await import("../../../src/core/trainer");

			const computeSharpe = (
				Trainer.prototype as unknown as Record<string, unknown>
			)._computeSharpe as (scores: number[]) => number;

			expect(computeSharpe([5, 5, 5])).toBe(5);
		});

		it("should return positive value for increasing scores", async () => {
			const { Trainer } = await import("../../../src/core/trainer");

			const computeSharpe = (
				Trainer.prototype as unknown as Record<string, unknown>
			)._computeSharpe as (scores: number[]) => number;

			expect(computeSharpe([1, 2])).toBeGreaterThan(0);
		});
	});

	describe("getGenerationContext", () => {
		it("should return null when no training has occurred", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);

			expect(trainer.getGenerationContext()).toBeNull();
		});
	});

	describe("getBestAgentSummary with genome", () => {
		it("should return null when bestGenome is null", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);

			expect(trainer.getBestAgentSummary()).toBeNull();
		});

		it("should return correct summary when bestGenome has fitnessMeta", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			const bestGenome = makeMinimalBestGenome() as DeepReadonly<LamarckGenome>;
			(trainer as any)._lastInfo = {
				symbol: "BTCUSDT",
				bestGenome,
				bestFitness: 1.5,
				bestFitnessMeta: makeMinimalFitnessMeta(),
				generation: 5,
				generationContext: null,
			};

			const summary = trainer.getBestAgentSummary();

			expect(summary).not.toBeNull();
			expect(summary!.id).toBe("test-best");
			expect(summary!.generation).toBe(5);
			expect(summary!.fitness).toBe(1.5);
			expect(summary!.sharpe).toBeGreaterThan(0);
			expect(summary!.avgPnl).toBeGreaterThan(0);
			expect(summary!.gaControl.populationSize).toBe(20);
			expect(summary!.network.inputDim).toBe(32);
			expect(summary!.network.outputDim).toBe(3);
			expect(summary!.network.hiddenLayers.length).toBe(2);
		});

		it("should return summary with zero sharpe and avgPnl when no fitnessMeta", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			const bestGenome = makeBestGenomeNoMeta() as DeepReadonly<LamarckGenome>;
			(trainer as any)._lastInfo = {
				symbol: "BTCUSDT",
				bestGenome,
				bestFitness: 0.5,
				generation: 5,
				generationContext: null,
			};

			const summary = trainer.getBestAgentSummary();

			expect(summary).not.toBeNull();
			expect(summary!.sharpe).toBe(0);
			expect(summary!.avgPnl).toBe(0);
		});

		it("should handle genome with fitnessMeta containing rawScores", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			const { createDefaultGenome } = await import(
				"../../../src/core/genetic-algorithm/factory"
			);
			const g = createDefaultGenome("test", 3) as DeepReadonly<LamarckGenome>;
			(trainer as any)._lastInfo = {
				symbol: "BTCUSDT",
				bestGenome: g,
				bestFitness: 0.5,
				bestFitnessMeta: {
					episodesRun: 5,
					computeMs: 2000,
					efficiencyScore: 1.0,
					variance: 0.05,
					rawScores: [1],
				},
				generation: 5,
				generationContext: null,
			};

			const summary = trainer.getBestAgentSummary();

			expect(summary).not.toBeNull();
			expect(summary!.avgPnl).toBe(1);
		});

		it("should return fitness as 0 when bestGenome fitness is null", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			const { createDefaultGenome } = await import(
				"../../../src/core/genetic-algorithm/factory"
			);
			const g = createDefaultGenome("test", 3) as DeepReadonly<LamarckGenome>;
			(trainer as any)._lastInfo = {
				symbol: "BTCUSDT",
				bestGenome: g,
				bestFitness: 0,
				generation: 5,
				generationContext: null,
			};

			const summary = trainer.getBestAgentSummary();

			expect(summary!.fitness).toBe(0);
		});
	});

	describe("callbacks", () => {
		it("should store generation context after training with onGeneration", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			feedCandles(dataBuffer, "BTCUSDT", 100);

			await trainer.train("BTCUSDT");

			const ctx = trainer.getGenerationContext();
			expect(ctx).not.toBeNull();
			expect(ctx!.generation).toBe(1);
			expect(ctx!.bestFitness).toBe(1.5);
		});

		it("should set best genome to final result after training", async () => {
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			feedCandles(dataBuffer, "BTCUSDT", 100);

			await trainer.train("BTCUSDT");

			const summary = trainer.getBestAgentSummary();
			expect(summary).not.toBeNull();
			expect(summary!.id).toBe("mock-result");
		});

		it("should skip updating bestGenome when archive is empty", async () => {
			mockArchiveData = [];
			const { Trainer } = await import("../../../src/core/trainer");
			const trainer = new Trainer(dataBuffer);
			feedCandles(dataBuffer, "BTCUSDT", 100);

			await trainer.train("BTCUSDT");

			const ctx = trainer.getGenerationContext();
			expect(ctx).not.toBeNull();
		});
	});
});
