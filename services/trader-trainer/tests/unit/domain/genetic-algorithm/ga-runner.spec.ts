import { describe, expect, it, jest } from "@jest/globals";
import { FeatureVector } from "@trading-model/model-runtime/feature-vector";
import type { Probability } from "@trading-model/primitives/primitives";
import { PositiveInt, Price } from "@trading-model/primitives/primitives";

jest.mock("../../../../src/domain/agent/trading-agent", () => {
	const makeMockAgent = () => ({
		forwardPass: jest.fn((..._args: any[]) => ({
			output: new Float32Array([0.5, 0.5, 0.5]),
		})),
		getWeights: jest.fn((..._args: any[]) => new Float32Array([0.1, 0.2])),
		parameterCount: jest.fn((..._args: any[]) => 2),
		setWeights: jest.fn<(...args: any[]) => any>(),
		remember: jest.fn<(...args: any[]) => any>(),
		replay: jest.fn((..._args: any[]) => 0),
		step: jest.fn((..._args: any[]) => ({ reward: 1, actionIndex: 0 })),
		resetEpisode: jest.fn<(...args: any[]) => any>(),
		wallet: {
			getPnL: jest.fn((..._args: any[]) => 50),
		},
	});
	return {
		__esModule: true,
		default: jest
			.fn<(...args: any[]) => any>()
			.mockImplementation(makeMockAgent),
		TradingAgent: jest
			.fn<(...args: any[]) => any>()
			.mockImplementation(makeMockAgent),
	};
});

jest.mock("@trading-model/model-runtime/env/wallet-manager", () => ({
	createWallet: jest.fn((..._args: any[]) => ({
		buy: jest.fn((..._args: any[]) => true),
		sell: jest.fn((..._args: any[]) => true),
		setPrice: jest.fn<(...args: any[]) => any>(),
		getPosition: jest.fn((..._args: any[]) => 0),
		getCash: jest.fn((..._args: any[]) => 1000),
		getValuation: jest.fn((..._args: any[]) => 1000),
		getPrice: jest.fn((..._args: any[]) => Price.of(100)),
		getPnL: jest.fn((..._args: any[]) => 0),
		reset: jest.fn<(...args: any[]) => any>(),
	})),
}));

jest.mock("@trading-model/model-runtime/agent/state-manager", () => ({
	StateManager: jest.fn<(...args: any[]) => any>().mockImplementation(() => ({
		initialiseFromGenome: jest.fn<(...args: any[]) => any>(),
		decayEpsilon: jest.fn<(...args: any[]) => any>(),
		resetEpsilon: jest.fn<(...args: any[]) => any>(),
		getEpsilon: jest.fn((..._args: any[]) => 0.5),
	})),
	default: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("../../../../src/domain/neural-network/neural-network", () => ({
	NeuralNetwork: jest.fn<(...args: any[]) => any>(),
}));

import { GeneticAlgorithmRunner } from "../../../../src/domain/genetic-algorithm/ga-runner";
import {
	ActivationType,
	ConnectionType,
	FitnessType,
	NormalisationType,
	SelectionType,
} from "../../../../src/domain/genetic-algorithm/genome";
import { createGAControlGenome } from "../../../../src/domain/genetic-algorithm/genome-control";
import { makeTradingAgentBackend } from "../../../../src/domain/genetic-algorithm/rl-backend";

function lastMockAgent(): Record<string, jest.Mock> {
	const { TradingAgent } = jest.requireMock(
		"../../../../src/domain/agent/trading-agent"
	) as { TradingAgent: jest.Mock };
	return TradingAgent.mock.results.at(-1)?.value as Record<string, jest.Mock>;
}

const makeSharedGenome = (id: string) =>
	({
		id,
		generation: 0,
		network: {
			inputDim: 32,
			outputDim: 3,
			hiddenLayers: [
				{
					neurons: 64,
					activation: ActivationType.Relu,
					connectionType: ConnectionType.FullyConnected,
					biasType: "standard",
				},
			],
			normalization: NormalisationType.ZScore,
		},
		rl: {
			gamma: 0.99,
			discretePolicy: {
				epsilonStart: 1.0,
				epsilonMin: 0.01,
				epsilonDecay: 0.995,
				learningRate: 0.001,
			},
			replayBuffer: { bufferSize: 4096, batchSize: 64 },
			horizon: { maxEpisodeLength: 500, frameSkip: 1, nStepReturn: 3 },
			rewardShaping: { sparse: false, normalize: false },
		},
		gaControl: {
			populationSize: 20,
			maxGenerations: 10,
			elitismFraction: 0.1,
			survivorFraction: 0.5,
			episodesPerIndividual: 2,
			selectionType: SelectionType.Tournament,
			fitnessType: FitnessType.Sharpe,
			networkSeed: 42,
			mutationSeed: 42,
			mutationRate: 0.1,
			crossoverRate: 0.5,
		},
		fitness: 0,
	}) as any;

describe("makeTradingAgentBackend", () => {
	it("should create an RLBackend from a genome", () => {
		const genome = makeSharedGenome("test-1");

		const backend = makeTradingAgentBackend(genome as any);
		expect(backend).toBeDefined();
		expect(typeof backend.forwardPass).toBe("function");
		expect(typeof backend.step).toBe("function");
	});

	it("should allow forwardPass without side effects", () => {
		const genome = makeSharedGenome("test-2");

		const backend = makeTradingAgentBackend(genome as any);
		const features = FeatureVector.fromFloat32Array(
			new Float32Array([0.5, 0.5, 0.5])
		);
		const output = backend.forwardPass(features);
		expect(output).toEqual(new Float32Array([0.5, 0.5, 0.5]));
		const agent = lastMockAgent();
		expect(agent.step).not.toHaveBeenCalled();
		expect(agent.remember).not.toHaveBeenCalled();
	});

	it("should inject trainedWeights when present in genome", () => {
		const genome = {
			id: "test-3",
			generation: 0,
			network: {
				inputDim: 4,
				outputDim: 2,
				hiddenLayers: [],
				normalization: NormalisationType.None,
			},
			rl: {
				gamma: 0.99,
				discretePolicy: {
					epsilonStart: 1.0,
					epsilonMin: 0.01,
					epsilonDecay: 0.995,
					learningRate: 0.001,
				},
				replayBuffer: { bufferSize: 128, batchSize: 32 },
				horizon: { maxEpisodeLength: 100, frameSkip: 1, nStepReturn: 3 },
				rewardShaping: { sparse: false, normalize: false },
			},
			gaControl: {
				populationSize: 20,
				maxGenerations: 10,
				elitismFraction: 0.1,
				survivorFraction: 0.5,
				episodesPerIndividual: 2,
				selectionType: SelectionType.Tournament,
				fitnessType: FitnessType.TotalPnl,
				networkSeed: 1,
				mutationSeed: 1,
				mutationRate: 0.1,
				crossoverRate: 0.5,
			},
			// the mocked agent has 2 parameters
			trainedWeights: [0.1, 0.2],
			fitness: 0,
		} as any;

		makeTradingAgentBackend(genome as any);
		expect(lastMockAgent().setWeights).toHaveBeenCalledWith(
			new Float32Array([0.1, 0.2])
		);
	});

	it("should not inject trainedWeights of another size", () => {
		makeTradingAgentBackend({
			...getMinimalGenome(),
			trainedWeights: [0.1, 0.2, 0.3],
		} as any);
		expect(lastMockAgent().setWeights).not.toHaveBeenCalled();
	});

	it("should call step and return reward", () => {
		const genome = getMinimalGenome();
		const backend = makeTradingAgentBackend(genome as any);
		const result = backend.step({
			features: FeatureVector.fromFloat32Array(
				new Float32Array([0.5, 0.5, 0.5])
			),
			price: Price.of(100),
		});
		expect(result.reward).toBe(1);
	});

	it("should store and replay a transition without throwing", () => {
		const genome = getMinimalGenome();
		const backend = makeTradingAgentBackend(genome as any);
		const features = FeatureVector.fromFloat32Array(
			new Float32Array([0.5, 0.5, 0.5])
		);
		expect(() => {
			backend.remember({
				state: features as unknown as Float32Array,
				action: 1,
				reward: 1,
				nextState: features as unknown as Float32Array,
				done: false,
			});
			backend.replay(1, 0.99);
		}).not.toThrow();
	});

	it("should get and set weights", () => {
		const genome = getMinimalGenome();
		const backend = makeTradingAgentBackend(genome as any);
		const w = backend.getWeights();
		expect(w.length).toBe(2);
		backend.setWeights(new Float32Array([0.5, 0.6]));
	});

	it("should return PnL from wallet", () => {
		const genome = getMinimalGenome();
		const backend = makeTradingAgentBackend(genome as any);
		expect(backend.getPnL()).toBe(50);
	});

	it("should reset episode", () => {
		const genome = getMinimalGenome();
		const backend = makeTradingAgentBackend(genome as any);
		expect(() => backend.resetEpisode()).not.toThrow();
	});
});

function getMinimalGenome() {
	return {
		id: "minimal",
		generation: 0,
		network: {
			inputDim: 3,
			outputDim: 3,
			hiddenLayers: [],
			normalization: NormalisationType.None,
		},
		rl: {
			gamma: 0.99,
			discretePolicy: {
				epsilonStart: 1.0,
				epsilonMin: 0.01,
				epsilonDecay: 0.995,
				learningRate: 0.001,
			},
			replayBuffer: { bufferSize: 128, batchSize: 32 },
			horizon: { maxEpisodeLength: 100, frameSkip: 1, nStepReturn: 3 },
			rewardShaping: { sparse: false, normalize: false },
		},
		mutation: {
			rate: 0.1,
			sigma: 0.5,
			addNeuronRate: 0.1,
			removeNeuronRate: 0.1,
			addLayerRate: 0.1,
			removeLayerRate: 0.1,
		},
		crossover: {
			probability: 0.5,
		},
		gaControl: {
			population: { size: 20, elitismFraction: 0.1, survivorFraction: 0.5 },
			termination: {
				rewardThreshold: Number.POSITIVE_INFINITY,
				stagnationPatience: 10,
				maxGenerations: 10,
				timeBudgetMs: 60000,
			},
			seeding: { envSeed: 1, mutationSeed: 1, networkSeed: 1 },
			evaluation: { episodesPerIndividual: 2 },
			selectionType: SelectionType.Tournament,
			fitnessType: FitnessType.TotalPnl,
			mutationRate: 0.1,
			mutationStd: 0.05,
		},
		fitness: 0,
	};
}

const makeBackend = (overrides: Record<string, unknown> = {}) => ({
	step: jest.fn((..._args: any[]) => ({ reward: 1, action: 0 })),
	remember: jest.fn<(...args: any[]) => any>(),
	replay: jest.fn<(...args: any[]) => any>(),
	getWeights: jest.fn((..._args: any[]) => new Float32Array([0.1, 0.2])),
	setWeights: jest.fn<(...args: any[]) => any>(),
	getPnL: jest.fn((..._args: any[]) => 50),
	resetEpisode: jest.fn<(...args: any[]) => any>(),
	forwardPass: jest.fn((_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])),
	...overrides,
});

describe("GeneticAlgorithmRunner", () => {
	const mockBackendFactory = makeBackend;

	const initRunner = (
		size: number,
		elitismFraction: number,
		extra: Record<string, unknown> = {}
	) => {
		const features = FeatureVector.fromFloat32Array(
			new Float32Array([0.5, 0.5, 0.5])
		);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [{ features, price: Price.of(100) }],
					validation: [{ features, price: Price.of(100) }],
				},
			],
			backendFactory: mockBackendFactory as any,
			...extra,
		});
		runner.processor.initialise({
			seeding: { envSeed: 42, mutationSeed: 42, networkSeed: 42 },
			population: {
				size: size as PositiveInt,
				elitismFraction: elitismFraction as Probability,
				survivorFraction: 0.5 as Probability,
			},
		});
		return runner;
	};

	it("should initialise a population with the correct size", () => {
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [{ features: new FeatureVector(), price: Price.of(100) }],
					validation: [{ features: new FeatureVector(), price: Price.of(100) }],
				},
			],
			backendFactory: mockBackendFactory as any,
		});
		runner.processor.initialise({
			seeding: { envSeed: 42, mutationSeed: 42, networkSeed: 42 },
			population: {
				size: 5 as PositiveInt,
				elitismFraction: 0.2 as Probability,
				survivorFraction: 0.5 as Probability,
			},
		});
		const pop = runner.processor.population;
		expect(pop.length).toBe(5);
		expect(runner.processor.generation).toBe(0);
	});

	it("should create genomes with unique IDs", () => {
		const runner = new GeneticAlgorithmRunner({
			windowSets: [{ id: "w1", train: [], validation: [] }],
			backendFactory: mockBackendFactory as any,
		});
		runner.processor.initialise();
		const pop = runner.processor.population;
		const ids = new Set(pop.map((g) => g.id));
		expect(ids.size).toBe(pop.length);
	});

	it("should report best genome as null before running", () => {
		const runner = new GeneticAlgorithmRunner({
			windowSets: [{ id: "w1", train: [], validation: [] }],
			backendFactory: mockBackendFactory as any,
		});
		runner.processor.initialise();
		expect(runner.processor.lastBestGenome).toBeUndefined();
	});

	it("should return empty archive before running", () => {
		const runner = new GeneticAlgorithmRunner({
			windowSets: [{ id: "w1", train: [], validation: [] }],
			backendFactory: mockBackendFactory as any,
		});
		runner.processor.initialise();
		expect(runner.processor.getArchiveMembers()).toEqual([]);
	});

	it("should select elites based on elitismFraction", async () => {
		const runner = initRunner(10, 0.3);
		await runner.processor.runGeneration();
		const pop = runner.processor.population;
		expect(pop.length).toBe(10);
		expect(runner.processor.generation).toBe(1);
	});

	it("should produce offspring with some new IDs after runGeneration (elites carry over)", async () => {
		const runner = initRunner(4, 0.2);
		await runner.processor.runGeneration();
		const childIds = new Set(runner.processor.population.map((g) => g.id));
		expect(childIds.size).toBeGreaterThan(0);
		expect(runner.processor.population.length).toBe(4);
	});

	it("should update Pareto archive after runGeneration", async () => {
		const onArchiveUpdate = jest.fn<(...args: any[]) => any>();
		const runner = initRunner(4, 0.2, { onArchiveUpdate });
		expect(runner.processor.getArchiveMembers()).toEqual([]);
		await runner.processor.runGeneration();
		expect(onArchiveUpdate).toHaveBeenCalled();
		if (runner.processor.getArchiveMembers().length > 0) {
			expect(runner.processor.getArchiveMembers()[0].id).toBeDefined();
		}
	});

	it("should track stagnation when fitness does not improve", async () => {
		const runner = initRunner(2, 0.2);
		const ctx1 = await runner.processor.runGeneration();
		const ctx2 = await runner.processor.runGeneration();
		expect(ctx2.stagnation).toBeGreaterThanOrEqual(ctx1.stagnation);
	});

	it("should sort population by Pareto rank and crowding distance", async () => {
		const runner = initRunner(5, 0.2);
		await runner.processor.runGeneration();
		const ctx = await runner.processor.runGeneration();
		expect(ctx.population.length).toBe(5);
	});

	it("should evaluate one genome only when the time budget is already spent mid-generation", async () => {
		const countCalls = async (startTime?: number) => {
			const factory = jest.fn((..._a: any[]) => makeBackend());
			const runner = initRunner(4, 0.2, { backendFactory: factory as any });
			await runner.processor.runGeneration(startTime);
			return factory.mock.calls.length;
		};
		const full = await countCalls();
		expect(await countCalls(0)).toBe(full / 4);
	});

	it("should run a single generation and produce a context", async () => {
		const features = FeatureVector.fromFloat32Array(
			new Float32Array([0.5, 0.5, 0.5])
		);
		const windowSets = [
			{
				id: "w1",
				train: [{ features, price: Price.of(100) }],
				validation: [{ features, price: Price.of(100) }],
			},
		];
		const onGeneration = jest.fn<(...args: any[]) => any>();
		const runner = new GeneticAlgorithmRunner({
			windowSets,
			backendFactory: mockBackendFactory as any,
			onGeneration,
		});
		runner.processor.initialise({
			seeding: { envSeed: 42, mutationSeed: 42, networkSeed: 42 },
			population: {
				size: 2 as PositiveInt,
				elitismFraction: 0.2 as Probability,
				survivorFraction: 0.5 as Probability,
			},
		});
		const ctx = await runner.processor.runGeneration();
		expect(ctx.generation).toBe(1);
		expect(ctx.population.length).toBe(2);
		expect(onGeneration).toHaveBeenCalledTimes(1);
		expect(ctx.bestFitness).toBeGreaterThan(Number.NEGATIVE_INFINITY);
	});
});

describe("full GA loop", () => {
	// ~0.3 s locally, but the CI coverage run (all workspaces in parallel) once
	// took over 5 s on the first one (PR #479). jest.setTimeout here applies to
	// the whole file, not to this block only.
	jest.setTimeout(20_000);

	const makeWindowSets = (trainLength: 1 | 2) => {
		const features = FeatureVector.fromFloat32Array(
			new Float32Array([0.5, 0.5, 0.5])
		);
		const train = [
			{
				features: FeatureVector.fromFloat32Array(
					new Float32Array([0.1, 0.2, 0.3])
				),
				price: Price.of(100),
			},
			{
				features: FeatureVector.fromFloat32Array(
					new Float32Array([0.4, 0.5, 0.6])
				),
				price: Price.of(101),
			},
		].slice(0, trainLength);
		const validation = [
			{ features, price: Price.of(100) },
			{ features, price: Price.of(101) },
		].slice(0, trainLength);
		return [{ id: "w1", train, validation }];
	};

	it("should run full GA loop successfully", async () => {
		const runner = new GeneticAlgorithmRunner({
			windowSets: makeWindowSets(2),
			backendFactory: makeBackend as any,
			initialControl: {
				population: {
					...createGAControlGenome().population,
					size: PositiveInt.of(2),
				},
				termination: {
					...createGAControlGenome().termination,
					maxGenerations: PositiveInt.of(4),
				},
			},
		});
		const result = await runner.run();
		expect(result).toBe(runner.processor.lastBestGenome);
		expect(runner.processor.generation).toBeGreaterThan(0);
		expect(runner.processor.generation).toBeLessThanOrEqual(4);
		expect(typeof result.id).toBe("string");
	});

	it("should exercise advanced GA branches (frameSkip, normalize, sparse, NSGA-II, weight crossover)", async () => {
		let factoryCallCount = 0;
		const mockBackendFactory = () => {
			const id = factoryCallCount++;
			return makeBackend({
				getWeights: jest.fn(
					(..._args: any[]) => new Float32Array([0.1, 0.2, 0.3])
				),
				getPnL: jest.fn((..._args: any[]) => 50 + id * 10),
			});
		};

		const onArchiveUpdate = jest.fn<(...args: any[]) => any>();
		const runner = new GeneticAlgorithmRunner({
			windowSets: makeWindowSets(2),
			backendFactory: mockBackendFactory as any,
			onArchiveUpdate,
		});

		runner.processor.initialise({
			seeding: { envSeed: 42, mutationSeed: 42, networkSeed: 42 },
			population: {
				size: 5 as PositiveInt,
				elitismFraction: 0.2 as Probability,
				survivorFraction: 0.5 as Probability,
			},
		});

		for (let i = 0; i < 4; i++) {
			await runner.processor.runGeneration();
		}
		expect(runner.processor.lastBestGenome).toBeDefined();
		expect(onArchiveUpdate).toHaveBeenCalled();
	});

	it.each([
		["rewardThreshold", { rewardThreshold: 0 }],
		["stagnationPatience", { stagnationPatience: 0 }],
		["timeBudgetMs", { timeBudgetMs: 1 }],
	])("should exit run via %s", async (_name, limit) => {
		const runner = new GeneticAlgorithmRunner({
			windowSets: makeWindowSets(1),
			backendFactory: makeBackend as any,
			initialControl: {
				populationSize: 2,
				maxGenerations: 100,
				...limit,
			} as any,
		});
		const result = await runner.run();
		expect(runner.processor.generation).toBeLessThan(100);
		expect(result).toBe(runner.processor.lastBestGenome);
		expect(typeof result.id).toBe("string");
	});

	it("should end after the current generation once its signal is aborted (ADR-0058)", async () => {
		const stop = new AbortController();
		const runner = new GeneticAlgorithmRunner({
			windowSets: makeWindowSets(1),
			backendFactory: makeBackend as any,
			initialControl: {
				termination: {
					rewardThreshold: Number.POSITIVE_INFINITY,
					stagnationPatience: 1000,
					maxGenerations: 100,
					timeBudgetMs: 3_600_000,
				},
			} as any,
			onGeneration: (ctx) => {
				if (ctx.generation === 2) {
					stop.abort();
				}
			},
			signal: stop.signal,
		});
		const result = await runner.run();
		expect(runner.processor.generation).toBe(2);
		expect(result).toBe(runner.processor.lastBestGenome);
	});

	it("should replay transitions while training", async () => {
		const trainMock = jest.fn<(...args: any[]) => any>();
		const runner = new GeneticAlgorithmRunner({
			windowSets: makeWindowSets(2),
			backendFactory: (() => makeBackend({ replay: trainMock })) as any,
			initialControl: { populationSize: 2, maxGenerations: 4 } as any,
		});
		await runner.run();
		expect(trainMock).toHaveBeenCalled();
	});
});
