import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NumericRange } from "@trading-model/primitives/numeric-range";
import type { PositiveInt, Ratio } from "@trading-model/primitives/primitives";
import {
	DurationMs,
	TradingSymbol,
} from "@trading-model/primitives/primitives";
import { Trainer } from "../../../src/application/trainer";
import { EpisodeScores } from "../../../src/domain/genetic-algorithm/episode-scores";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import {
	ActivationType,
	ConnectionType,
	FitnessType,
	InitialisationType,
	NormalisationType,
	SelectionType,
} from "../../../src/domain/genetic-algorithm/genome";
import type { LamarckGenome } from "../../../src/domain/genetic-algorithm/genome-types";
import type { DeepReadonly } from "../../../src/domain/genetic-algorithm/shared-types";
import { MarketDataBuffer } from "../../../src/domain/market-data-buffer";
import type { TrainingSettings } from "../../../src/domain/training-settings";
import { LastTrainingInfo } from "../../../src/domain/training-state";
import {
	makeBestGenomeNoMeta,
	makeMinimalBestGenome,
	makeMinimalFitnessMeta,
} from "../../fixtures/genome.fixture";
import { feedCandles } from "../../fixtures/market-data.fixture";

jest.mock<{ ENV: any }>("../../../src/infrastructure/config/env", () => ({
	ENV: {
		TRAINER_SYMBOLS: "BTCUSDT",
		TRAINER_DATA_WINDOW: 500,
		TRAINER_VALIDATION_SPLIT: 0.2,
		TRAINER_GENERATIONS: 10,
		TRAINER_POPULATION_SIZE: 5,
		TRAINER_TIME_BUDGET_MS: 60000,
		TRAINER_EPISODES_PER_INDIVIDUAL: 2,
		TRAINER_FITNESS_TYPE: "total_pnl",
	},
}));

/** Mirrors the TRAINER_* values of the mocked ENV above. */
const TEST_TRAINING_SETTINGS: TrainingSettings = {
	validationSplit: 0.2,
	walkForwardFolds: 1,
	generations: 10,
	populationSize: 5,
	timeBudgetMs: 60000,
	episodesPerIndividual: 2,
	fitnessType: FitnessType.TotalPnl,
};

let capturedOnGeneration: ((ctx: any) => void) | null = null;
let capturedOnArchiveUpdate: ((archive: any[]) => void) | null = null;
let mockRunImpl: (() => Promise<any>) | null = null;
let mockArchiveData: any[] = [{ id: "best-archived" }];

jest.mock("../../../src/domain/genetic-algorithm/ga-runner", () => {
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
					population: {
						size: 20,
						elitismFraction: 0.1,
						survivorFraction: 0.5,
					},
					evaluation: {
						episodesPerIndividual: 3,
					},
					seeding: { envSeed: 42, mutationSeed: 1337, networkSeed: 7 },
					termination: {
						rewardThreshold: Number.POSITIVE_INFINITY,
						stagnationPatience: 15,
						maxGenerations: 100,
						timeBudgetMs: 300000,
					},
					selectionType: SelectionType.Tournament,
					fitnessType: FitnessType.TotalPnl,
					mutationRate: 0.1,
					mutationStd: 0.05,
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
						clipBounds: new NumericRange(-1, 1),
						scale: false,
						scaleFactor: 1,
						normalize: false,
						sparse: false,
					},
					horizon: { maxEpisodeLength: 500, nStepReturn: 1, frameSkip: 1 },
					discretePolicy: {
						epsilonStart: 1.0,
						epsilonMin: 0.05,
						epsilonDecay: 0.995,
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
					addNeuronRate: 0.01,
					removeNeuronRate: 0.01,
					addLayerRate: 0.005,
					removeLayerRate: 0.005,
				},
				crossover: {
					probability: 0.7,
				},
			});
		}),
		processor: { generation: 5 },
	};
	return {
		GeneticAlgorithmRunner: jest
			.fn<(...args: any[]) => any>()
			.mockImplementation((opts: any) => {
				capturedOnGeneration = opts.onGeneration || null;
				capturedOnArchiveUpdate = opts.onArchiveUpdate || null;
				return mockRunner;
			}),
		makeTradingAgentBackend: jest.fn<(...args: any[]) => any>(),
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
		it("should return null from getBestAgentSummary before training", () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});

			const summary = trainer.getBestAgentSummary();

			expect(summary).toBeNull();
		});

		it("should return false from isTraining before training", () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});

			expect(trainer.isTraining()).toBe(false);
		});

		it("should return 0 from getGeneration before training", () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});

			expect(trainer.getGeneration()).toBe(0);
		});

		it("should return empty string from getCurrentSymbol before training", () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});

			expect(trainer.getCurrentSymbol()).toBe("");
		});

		it("should return null from getGenerationContext before training", () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});

			expect(trainer.getGenerationContext()).toBeNull();
		});
	});

	describe("train with insufficient data", () => {
		it("should return failure result with fewer than 10 steps", async () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles(dataBuffer, "BTCUSDT", 5);

			const result = await trainer.train(TradingSymbol.of("BTCUSDT"));

			expect(result.success).toBe(false);
			expect(trainer.isTraining()).toBe(false);
			expect(trainer.getBestAgentSummary()).toBeNull();
		});

		it("should not start training when train split has fewer than 10 steps after validation split", async () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles(dataBuffer, "BTCUSDT", 11);

			const result = await trainer.train(TradingSymbol.of("BTCUSDT"));

			expect(result.success).toBe(false);
			expect(trainer.isTraining()).toBe(false);
			expect(trainer.getBestAgentSummary()).toBeNull();
		});

		it("should return failure result if already training", async () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			(trainer as any)._status = "training";

			const result = await trainer.train(TradingSymbol.of("BTCUSDT"));

			expect(result.success).toBe(false);
			expect(trainer.isTraining()).toBe(true);
		});
	});

	describe("train with sufficient data", () => {
		it("should return success result with enough data", async () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const result = await trainer.train(TradingSymbol.of("BTCUSDT"));

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.symbol).toBe("BTCUSDT");
				expect(result.bestGenome).toBeDefined();
			}
			expect(trainer.isTraining()).toBe(false);
		});

		it("should set currentSymbol after training", async () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			await trainer.train(TradingSymbol.of("BTCUSDT"));

			expect(trainer.getCurrentSymbol()).toBe("BTCUSDT");
		});

		it("should update getGeneration from runner", async () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			await trainer.train(TradingSymbol.of("BTCUSDT"));

			expect(trainer.getGeneration()).toBe(5);
		});

		it("should update bestGenome after successful training", async () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const result = await trainer.train(TradingSymbol.of("BTCUSDT"));

			expect(result.success).toBe(true);
			const summary = trainer.getBestAgentSummary();
			expect(summary).not.toBeNull();
			expect(summary!.id).toBe("mock-result");
		});

		it("should return failure result with error details when training throws", async () => {
			mockRunImpl = () => {
				return Promise.reject(new Error("training error"));
			};
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const result = await trainer.train(TradingSymbol.of("BTCUSDT"));

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
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const result = await trainer.train(TradingSymbol.of("BTCUSDT"));

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.symbol).toBe("BTCUSDT");
				expect(result.error.message).toBe("string error");
			}
			expect(trainer.isTraining()).toBe(false);
		});

		it("should handle null fitness in training result", async () => {
			mockRunImpl = async () => ({ id: "no-fitness" });
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const result = await trainer.train(TradingSymbol.of("BTCUSDT"));

			expect(result.success).toBe(true);
			expect(trainer.isTraining()).toBe(false);
		});
	});

	describe("getGenerationContext", () => {
		it("should return null when no training has occurred", () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});

			expect(trainer.getGenerationContext()).toBeNull();
		});
	});

	describe("getBestAgentSummary with genome", () => {
		it("should return null when bestGenome is null", () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});

			expect(trainer.getBestAgentSummary()).toBeNull();
		});

		it("should return correct summary when bestGenome has fitnessMeta", () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			const bestGenome = makeMinimalBestGenome() as DeepReadonly<LamarckGenome>;
			(trainer as any)._lastInfo = new LastTrainingInfo({
				symbol: "BTCUSDT" as never,
				bestGenome,
				bestFitness: 1.5 as never,
				bestFitnessMeta: makeMinimalFitnessMeta(),
				generation: 5 as never,
				generationContext: null,
			});

			const summary = trainer.getBestAgentSummary();

			expect(summary).not.toBeNull();
			expect(summary!.id).toBe("test-best");
			expect(summary!.generation).toBe(5);
			expect(summary!.fitness).toBe(1.5);
			expect(summary!.sharpe).toBeGreaterThan(0);
			expect(summary!.avgPnl).toBeGreaterThan(0);
			expect(summary!.gaControl.populationSize).toBe(20);
			expect(summary!.network.inputDim).toBe(33);
			expect(summary!.network.outputDim).toBe(3);
			expect(summary!.network.hiddenLayers.length).toBe(2);
		});

		it("should return summary with zero sharpe and avgPnl when no fitnessMeta", () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			const bestGenome = makeBestGenomeNoMeta() as DeepReadonly<LamarckGenome>;
			(trainer as any)._lastInfo = new LastTrainingInfo({
				symbol: "BTCUSDT" as never,
				bestGenome,
				bestFitness: 0.5 as never,
				bestFitnessMeta: undefined,
				generation: 5 as never,
				generationContext: null,
			});

			const summary = trainer.getBestAgentSummary();

			expect(summary).not.toBeNull();
			expect(summary!.sharpe).toBe(0);
			expect(summary!.avgPnl).toBe(0);
		});

		it("should handle genome with fitnessMeta containing rawScores", () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			const g = createDefaultGenome(
				"test",
				3 as PositiveInt
			) as DeepReadonly<LamarckGenome>;
			(trainer as any)._lastInfo = new LastTrainingInfo({
				symbol: "BTCUSDT" as never,
				bestGenome: g,
				bestFitness: 0.5 as never,
				bestFitnessMeta: {
					episodesRun: 5 as PositiveInt,
					computeMs: DurationMs.of(2000),
					efficiencyScore: 1.0 as Ratio,
					variance: 0.05,
					rawScores: new EpisodeScores([1]),
				},
				generation: 5 as never,
				generationContext: null,
			});

			const summary = trainer.getBestAgentSummary();

			expect(summary).not.toBeNull();
			expect(summary!.avgPnl).toBe(1);
		});

		it("should return fitness as 0 when bestGenome fitness is null", () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			const g = createDefaultGenome(
				"test",
				3 as PositiveInt
			) as DeepReadonly<LamarckGenome>;
			(trainer as any)._lastInfo = new LastTrainingInfo({
				symbol: "BTCUSDT" as never,
				bestGenome: g,
				bestFitness: 0 as never,
				bestFitnessMeta: undefined,
				generation: 5 as never,
				generationContext: null,
			});

			const summary = trainer.getBestAgentSummary();

			expect(summary!.fitness).toBe(0);
		});
	});

	describe("callbacks", () => {
		it("should store generation context after training with onGeneration", async () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			await trainer.train(TradingSymbol.of("BTCUSDT"));

			const ctx = trainer.getGenerationContext();
			expect(ctx).not.toBeNull();
			expect(ctx!.generation).toBe(1);
			expect(ctx!.bestFitness).toBe(1.5);
		});

		it("should set best genome to final result after training", async () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			await trainer.train(TradingSymbol.of("BTCUSDT"));

			const summary = trainer.getBestAgentSummary();
			expect(summary).not.toBeNull();
			expect(summary!.id).toBe("mock-result");
		});

		it("should skip updating bestGenome when archive is empty", async () => {
			mockArchiveData = [];
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			await trainer.train(TradingSymbol.of("BTCUSDT"));

			const ctx = trainer.getGenerationContext();
			expect(ctx).not.toBeNull();
		});
	});
});

describe("Trainer — model publication", () => {
	let dataBuffer: MarketDataBuffer;

	beforeEach(() => {
		dataBuffer = new MarketDataBuffer({ maxSize: 500 });
		capturedOnGeneration = null;
		capturedOnArchiveUpdate = null;
		mockRunImpl = null;
		mockArchiveData = [{ id: "best-archived" }];
		feedCandles(dataBuffer, "BTCUSDT", 100);
	});

	it("should publish the best agent after a successful training", async () => {
		const publisher = {
			publish: jest.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
		};
		const trainer = new Trainer(dataBuffer, {
			settings: TEST_TRAINING_SETTINGS,
			publisher,
		});

		const result = await trainer.train(TradingSymbol.of("BTCUSDT"));

		expect(result.success).toBe(true);
		expect(publisher.publish).toHaveBeenCalledWith(
			"BTCUSDT",
			expect.objectContaining({ id: expect.any(String) })
		);
	});

	it("should keep the training successful when publication fails", async () => {
		const publisher = {
			publish: jest
				.fn<(...args: any[]) => any>()
				.mockRejectedValue(new Error("bus down")),
		};
		const trainer = new Trainer(dataBuffer, {
			settings: TEST_TRAINING_SETTINGS,
			publisher,
		});

		const result = await trainer.train(TradingSymbol.of("BTCUSDT"));

		expect(result.success).toBe(true);
		expect(publisher.publish).toHaveBeenCalled();
	});

	it("should tolerate a non-Error publication failure", async () => {
		const publisher = {
			publish: jest.fn<(...args: any[]) => any>().mockRejectedValue("nope"),
		};
		const trainer = new Trainer(dataBuffer, {
			settings: TEST_TRAINING_SETTINGS,
			publisher,
		});

		await expect(
			trainer.train(TradingSymbol.of("BTCUSDT"))
		).resolves.toMatchObject({ success: true });
	});

	it("should hand the GA telemetry and the settings to the training session", async () => {
		const telemetry = {
			generationStarted: jest.fn<(...args: any[]) => any>(),
			stagnationUpdated: jest.fn<(...args: any[]) => any>(),
			evaluationFailed: jest.fn<(...args: any[]) => any>(),
			genomeEvaluated: jest.fn<(...args: any[]) => any>(),
			crossoverFallbacks: jest.fn<(...args: any[]) => any>(),
		};
		const trainer = new Trainer(dataBuffer, {
			settings: TEST_TRAINING_SETTINGS,
			telemetry,
		});

		await trainer.train(TradingSymbol.of("BTCUSDT"));

		const { GeneticAlgorithmRunner } = jest.requireMock(
			"../../../src/domain/genetic-algorithm/ga-runner"
		) as { GeneticAlgorithmRunner: jest.Mock<(...args: any[]) => any> };
		const opts = GeneticAlgorithmRunner.mock.calls.at(-1)?.[0] as {
			telemetry: unknown;
			initialControl: { population: { size: number } };
		};
		expect(opts.telemetry).toBe(telemetry);
		expect(opts.initialControl.population.size).toBe(
			TEST_TRAINING_SETTINGS.populationSize
		);
	});

	describe("model artifacts (ADR-0022)", () => {
		/** The best genome of a default run, with trained weights added. */
		async function trainedGenome(): Promise<any> {
			const probe = new Trainer(new MarketDataBuffer({ maxSize: 500 }), {
				settings: TEST_TRAINING_SETTINGS,
			});
			feedCandles((probe as any)._dataBuffer, "BTCUSDT", 100);
			const result = await probe.train(TradingSymbol.of("BTCUSDT"));
			if (!result.success) {
				throw new Error("probe training failed");
			}
			return {
				...result.bestGenome,
				trainedWeights: new Float32Array([0.5, -0.25, 1]),
			};
		}

		function fakeStore() {
			return {
				save: jest.fn<(artifact: any) => Promise<any>>().mockResolvedValue({
					version: "20261029T101530Z-0123456789ab",
				}),
				list: jest.fn<(...args: any[]) => any>(),
				manifest: jest.fn<(...args: any[]) => any>(),
				weights: jest.fn<(...args: any[]) => any>(),
			};
		}

		it("stores the best agent with its weights, feature layout and normalization", async () => {
			const genome = await trainedGenome();
			mockRunImpl = () => Promise.resolve(genome);
			const models = fakeStore();
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
				models,
				instanceId: "trader-trainer-2",
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const result = await trainer.train(TradingSymbol.of("BTCUSDT"));

			expect(result.success).toBe(true);
			expect(models.save).toHaveBeenCalledTimes(1);
			const artifact = models.save.mock.calls[0][0];
			expect(artifact).toMatchObject({
				symbol: "BTCUSDT",
				instanceId: "trader-trainer-2",
				features: {
					dim: 33,
					fields: expect.arrayContaining(["CandleClose", "AgentExposure"]),
				},
				summary: { id: genome.id },
			});
			expect([...artifact.weights]).toEqual([0.5, -0.25, 1]);
			expect(artifact.normalization).toMatchObject({
				candle: { close: { count: expect.any(Number) } },
			});
			expect(artifact.normalization.candle.close.count).toBeGreaterThan(0);
		});

		it("stopTraining ends the session in flight, then stores and publishes its model (ADR-0058)", async () => {
			const genome = await trainedGenome();
			const models = fakeStore();
			const publisher = {
				publish: jest
					.fn<(...args: any[]) => any>()
					.mockResolvedValue(undefined),
			};
			let signal: AbortSignal | undefined;
			const runner = (
				_windows: unknown,
				_settings: unknown,
				_telemetry: unknown,
				received?: AbortSignal
			) =>
				new Promise<any>((resolve) => {
					signal = received;
					received?.addEventListener("abort", () =>
						resolve({
							bestGenome: genome,
							bestFitness: 1,
							generation: 1,
							generationContext: null,
						})
					);
				});
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
				models,
				publisher,
				runner,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const training = trainer.train(TradingSymbol.of("BTCUSDT"));
			expect(trainer.isTraining()).toBe(true);
			await trainer.stopTraining();

			expect(signal?.aborted).toBe(true);
			expect(models.save).toHaveBeenCalledTimes(1);
			expect(publisher.publish).toHaveBeenCalledTimes(1);
			expect(trainer.isTraining()).toBe(false);
			await expect(training).resolves.toMatchObject({ success: true });
		});

		it("stopTraining resolves at once when no session runs", async () => {
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
			});

			await expect(trainer.stopTraining()).resolves.toBeUndefined();
		});

		describe("rehydrate", () => {
			const sym = TradingSymbol.of("BTCUSDT");
			async function storedManifest() {
				const genome = await trainedGenome();
				const { trainedWeights: _w, ...g } = genome;
				return {
					version: "v1",
					genome: JSON.parse(JSON.stringify(g)),
					metrics: {
						generation: 3,
						fitness: 1.5,
						sharpe: 0.9,
						avgPnl: 2,
						maxDrawdown: 4,
					},
				};
			}

			it("serves the newest manifest summary, then a training replaces it", async () => {
				const genome = await trainedGenome();
				mockRunImpl = () => Promise.resolve(genome);
				const models = fakeStore();
				models.list.mockResolvedValue([{ version: "v1" }] as never);
				models.manifest.mockResolvedValue((await storedManifest()) as never);
				const trainer = new Trainer(dataBuffer, {
					settings: TEST_TRAINING_SETTINGS,
					models,
				});

				await trainer.rehydrate([sym]);

				expect(
					trainer.getSnapshotForSymbol(sym)?.buildBestAgentSummary()
				).toMatchObject({
					fitness: 1.5,
					generation: 3,
				});
				expect(trainer.getBestAgentSummary()?.fitness).toBe(1.5);

				feedCandles(dataBuffer, "BTCUSDT", 100);
				await trainer.train(sym);
				expect(
					trainer.getSnapshotForSymbol(sym)?.buildBestAgentSummary()?.id
				).toBe(genome.id);
			});

			it("leaves no snapshot without manifest", async () => {
				const models = fakeStore();
				models.list.mockResolvedValue([] as never);
				const trainer = new Trainer(dataBuffer, {
					settings: TEST_TRAINING_SETTINGS,
					models,
				});
				await trainer.rehydrate([sym]);
				expect(trainer.getSnapshotForSymbol(sym)).toBeUndefined();
				expect(trainer.getBestAgentSummary()).toBeNull();
			});

			it("skips an unreadable manifest", async () => {
				const models = fakeStore();
				models.list.mockRejectedValue(new Error("EIO") as never);
				const trainer = new Trainer(dataBuffer, {
					settings: TEST_TRAINING_SETTINGS,
					models,
				});
				await expect(trainer.rehydrate([sym])).resolves.toBeUndefined();
				expect(trainer.getSnapshotForSymbol(sym)).toBeUndefined();
			});
		});

		it("does not store a best genome without trained weights", async () => {
			const models = fakeStore();
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
				models,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const result = await trainer.train(TradingSymbol.of("BTCUSDT"));

			expect(result.success).toBe(true);
			expect(models.save).not.toHaveBeenCalled();
		});

		it("keeps the training successful when the artifact cannot be written", async () => {
			const genome = await trainedGenome();
			mockRunImpl = () => Promise.resolve(genome);
			const models = fakeStore();
			models.save.mockRejectedValue(new Error("EACCES: permission denied"));
			const trainer = new Trainer(dataBuffer, {
				settings: TEST_TRAINING_SETTINGS,
				models,
			});
			feedCandles(dataBuffer, "BTCUSDT", 100);

			const result = await trainer.train(TradingSymbol.of("BTCUSDT"));

			expect(result.success).toBe(true);
			expect(trainer.getBestAgentSummary()).not.toBeNull();
		});
	});
});
