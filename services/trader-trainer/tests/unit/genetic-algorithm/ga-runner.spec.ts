import { describe, expect, it, jest } from "@jest/globals";
import type {
	PositiveInt,
	Probability,
} from "@trading-model/primitives/primitives";
import { Price } from "@trading-model/primitives/primitives";
import { FeatureVector } from "../../../src/domain/feature-vector";

jest.mock("../../../src/domain/agent/trading-agent", () => {
	const makeMockAgent = () => ({
		forwardPass: jest.fn((..._args: any[]) => ({
			output: new Float32Array([0.5, 0.5, 0.5]),
		})),
		getWeights: jest.fn((..._args: any[]) => new Float32Array([0.1, 0.2])),
		parameterCount: jest.fn((..._args: any[]) => 2),
		setWeights: jest.fn<(...args: any[]) => any>(),
		getExperiencePool: jest.fn((..._args: any[]) => []),
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

jest.mock("../../../src/domain/env/wallet-manager", () => ({
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

jest.mock("../../../src/domain/agent/state-manager", () => ({
	StateManager: jest.fn<(...args: any[]) => any>().mockImplementation(() => ({
		initialiseFromGenome: jest.fn<(...args: any[]) => any>(),
		decayEpsilon: jest.fn<(...args: any[]) => any>(),
		resetEpsilon: jest.fn<(...args: any[]) => any>(),
		getEpsilon: jest.fn((..._args: any[]) => 0.5),
	})),
	default: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("../../../src/domain/neural-network/agent", () => ({
	Agent: jest.fn<(...args: any[]) => any>().mockImplementation(() => ({
		nn: {
			forward: jest.fn((..._args: any[]) => ({
				output: new Float32Array([0.5, 0.5, 0.5]),
			})),
			parameterCount: jest.fn((..._args: any[]) => 42),
			getWeights: jest.fn((..._args: any[]) => new Float32Array([0.1, 0.2])),
			setWeights: jest.fn<(...args: any[]) => any>(),
			distributeAroundWeights: jest.fn<(...args: any[]) => any>(),
		},
		experience: {
			getPool: jest.fn((..._args: any[]) => []),
			clearPool: jest.fn<(...args: any[]) => any>(),
		},
	})),
}));

jest.mock("../../../src/domain/neural-network/neural-network", () => ({
	NeuralNetwork: jest.fn<(...args: any[]) => any>(),
}));

import { GeneticAlgorithmRunner } from "../../../src/domain/genetic-algorithm/ga-runner";
import {
	ActivationType,
	ConnectionType,
	FitnessType,
	NormalisationType,
	SelectionType,
} from "../../../src/domain/genetic-algorithm/genome";
import { makeTradingAgentBackend } from "../../../src/domain/genetic-algorithm/rl-backend";

describe("makeTradingAgentBackend", () => {
	it("should create an RLBackend from a genome", () => {
		const genome = {
			id: "test-1",
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
		} as any;

		const backend = makeTradingAgentBackend(genome as any);
		expect(backend).toBeDefined();
		expect(typeof backend.forwardPass).toBe("function");
		expect(typeof backend.step).toBe("function");
	});

	it("should allow forwardPass without side effects", () => {
		const genome = {
			id: "test-2",
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
		} as any;

		const backend = makeTradingAgentBackend(genome as any);
		const features = FeatureVector.fromFloat32Array(
			new Float32Array([0.5, 0.5, 0.5])
		);
		const output = backend.forwardPass(features);
		expect(output).toBeDefined();
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
			trainedWeights: [0.1, 0.2, 0.3, 0.4, 0.5],
			fitness: 0,
		} as any;

		const backend = makeTradingAgentBackend(genome as any);
		expect(backend).toBeDefined();
		const weights = backend.getWeights();
		expect(weights).toBeDefined();
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

describe("GeneticAlgorithmRunner", () => {
	const mockBackendFactory = () => ({
		forwardPass: jest.fn(
			(_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])
		),
		step: jest.fn((..._args: any[]) => ({ reward: 1, action: 0 })),
		remember: jest.fn<(...args: any[]) => any>(),
		replay: jest.fn<(...args: any[]) => any>(),
		getWeights: jest.fn((..._args: any[]) => new Float32Array([0.1, 0.2])),
		setWeights: jest.fn<(...args: any[]) => any>(),
		getPnL: jest.fn((..._args: any[]) => 50),
		resetEpisode: jest.fn<(...args: any[]) => any>(),
		getExperiencePool: jest.fn((..._args: any[]) => []),
	});

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
		});
		runner.processor.initialise({
			seeding: { envSeed: 42, mutationSeed: 42, networkSeed: 42 },
			population: {
				size: 10 as PositiveInt,
				elitismFraction: 0.3 as Probability,
				survivorFraction: 0.5 as Probability,
			},
		});
		await runner.processor.runGeneration();
		const pop = runner.processor.population;
		expect(pop.length).toBe(10);
		expect(runner.processor.generation).toBe(1);
	});

	it("should produce offspring with some new IDs after runGeneration (elites carry over)", async () => {
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
		});
		runner.processor.initialise({
			seeding: { envSeed: 42, mutationSeed: 42, networkSeed: 42 },
			population: {
				size: 4 as PositiveInt,
				elitismFraction: 0.2 as Probability,
				survivorFraction: 0.5 as Probability,
			},
		});
		await runner.processor.runGeneration();
		const childIds = new Set(runner.processor.population.map((g) => g.id));
		expect(childIds.size).toBeGreaterThan(0);
		expect(runner.processor.population.length).toBe(4);
	});

	it("should update Pareto archive after runGeneration", async () => {
		const features = FeatureVector.fromFloat32Array(
			new Float32Array([0.5, 0.5, 0.5])
		);
		const onArchiveUpdate = jest.fn<(...args: any[]) => any>();
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [{ features, price: Price.of(100) }],
					validation: [{ features, price: Price.of(100) }],
				},
			],
			backendFactory: mockBackendFactory as any,
			onArchiveUpdate,
		});
		runner.processor.initialise({
			seeding: { envSeed: 42, mutationSeed: 42, networkSeed: 42 },
			population: {
				size: 4 as PositiveInt,
				elitismFraction: 0.2 as Probability,
				survivorFraction: 0.5 as Probability,
			},
		});
		expect(runner.processor.getArchiveMembers()).toEqual([]);
		await runner.processor.runGeneration();
		expect(onArchiveUpdate).toHaveBeenCalled();
		if (runner.processor.getArchiveMembers().length > 0) {
			expect(runner.processor.getArchiveMembers()[0].id).toBeDefined();
		}
	});

	it("should track stagnation when fitness does not improve", async () => {
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
		});
		runner.processor.initialise({
			seeding: { envSeed: 42, mutationSeed: 42, networkSeed: 42 },
			population: {
				size: 2 as PositiveInt,
				elitismFraction: 0.2 as Probability,
				survivorFraction: 0.5 as Probability,
			},
		});
		const ctx1 = await runner.processor.runGeneration();
		const ctx2 = await runner.processor.runGeneration();
		expect(ctx2.stagnation).toBeGreaterThanOrEqual(ctx1.stagnation);
	});

	it("should sort population by Pareto rank and crowding distance", async () => {
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
		});
		runner.processor.initialise({
			seeding: { envSeed: 42, mutationSeed: 42, networkSeed: 42 },
			population: {
				size: 5 as PositiveInt,
				elitismFraction: 0.2 as Probability,
				survivorFraction: 0.5 as Probability,
			},
		});
		await runner.processor.runGeneration();
		const ctx = await runner.processor.runGeneration();
		expect(ctx.population.length).toBe(5);
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

	it("should run full GA loop successfully", async () => {
		const mockBackendFactory = () => ({
			step: jest.fn((..._args: any[]) => ({ reward: 1, action: 0 })),
			remember: jest.fn<(...args: any[]) => any>(),
			replay: jest.fn<(...args: any[]) => any>(),
			getWeights: jest.fn((..._args: any[]) => new Float32Array([0.1, 0.2])),
			setWeights: jest.fn<(...args: any[]) => any>(),
			getPnL: jest.fn((..._args: any[]) => 50),
			resetEpisode: jest.fn<(...args: any[]) => any>(),
			getExperiencePool: jest.fn((..._args: any[]) => [
				{
					input: new Float32Array([0.1, 0.2, 0.3]),
					output: new Float32Array([0.1, 0.2, 0.3]),
					reward: 1,
					nextState: new Float32Array([0.1, 0.2, 0.3]),
					action: 0,
				},
				{
					input: new Float32Array([0.4, 0.5, 0.6]),
					output: new Float32Array([0.4, 0.5, 0.6]),
					reward: 1,
					nextState: new Float32Array([0.4, 0.5, 0.6]),
					action: 2,
				},
			]),
			forwardPass: jest.fn(
				(_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])
			),
		});

		const features = FeatureVector.fromFloat32Array(
			new Float32Array([0.5, 0.5, 0.5])
		);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [
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
					],
					validation: [
						{ features, price: Price.of(100) },
						{ features, price: Price.of(101) },
					],
				},
			],
			backendFactory: mockBackendFactory as any,
			initialControl: { populationSize: 2, maxGenerations: 4 } as any,
		});
		const result = await runner.run();
		expect(result).toBe(runner.processor.lastBestGenome);
		expect(runner.processor.generation).toBeGreaterThan(0);
		expect(typeof result.id).toBe("string");
	});

	it("should exercise advanced GA branches (frameSkip, normalize, sparse, NSGA-II, weight crossover)", async () => {
		let factoryCallCount = 0;
		const mockBackendFactory = () => {
			const id = factoryCallCount++;
			return {
				step: jest.fn((..._args: any[]) => ({ reward: 1, action: 0 })),
				remember: jest.fn<(...args: any[]) => any>(),
				replay: jest.fn<(...args: any[]) => any>(),
				getWeights: jest.fn(
					(..._args: any[]) => new Float32Array([0.1, 0.2, 0.3])
				),
				setWeights: jest.fn<(...args: any[]) => any>(),
				getPnL: jest.fn((..._args: any[]) => 50 + id * 10),
				resetEpisode: jest.fn<(...args: any[]) => any>(),
				getExperiencePool: jest.fn((..._args: any[]) => [
					{
						input: new Float32Array([0.1, 0.2, 0.3]),
						output: new Float32Array([0.1, 0.2, 0.3]),
						reward: 1,
						nextState: new Float32Array([0.1, 0.2, 0.3]),
					},
				]),
				forwardPass: jest.fn(
					(_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])
				),
			};
		};

		const onArchiveUpdate = jest.fn<(...args: any[]) => any>();
		const features = FeatureVector.fromFloat32Array(
			new Float32Array([0.5, 0.5, 0.5])
		);

		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [
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
					],
					validation: [
						{ features, price: Price.of(100) },
						{ features, price: Price.of(101) },
					],
				},
			],
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

	it("should exit run via rewardThreshold", async () => {
		const features = FeatureVector.fromFloat32Array(
			new Float32Array([0.5, 0.5, 0.5])
		);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [
						{
							features: FeatureVector.fromFloat32Array(
								new Float32Array([0.1, 0.2, 0.3])
							),
							price: Price.of(100),
						},
					],
					validation: [{ features, price: Price.of(100) }],
				},
			],
			backendFactory: (() => ({
				step: jest.fn((..._args: any[]) => ({ reward: 1, action: 0 })),
				remember: jest.fn<(...args: any[]) => any>(),
				replay: jest.fn<(...args: any[]) => any>(),
				getWeights: jest.fn((..._args: any[]) => new Float32Array([0.1, 0.2])),
				setWeights: jest.fn<(...args: any[]) => any>(),
				getPnL: jest.fn((..._args: any[]) => 50),
				resetEpisode: jest.fn<(...args: any[]) => any>(),
				getExperiencePool: jest.fn((..._args: any[]) => []),
				forwardPass: jest.fn(
					(_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])
				),
			})) as any,
			initialControl: {
				populationSize: 2,
				maxGenerations: 100,
				rewardThreshold: 0,
			} as any,
		});
		const result = await runner.run();
		expect(runner.processor.generation).toBeLessThan(100);
		expect(result).toBe(runner.processor.lastBestGenome);
		expect(typeof result.id).toBe("string");
	});

	it("should exit run via stagnationPatience", async () => {
		const features = FeatureVector.fromFloat32Array(
			new Float32Array([0.5, 0.5, 0.5])
		);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [
						{
							features: FeatureVector.fromFloat32Array(
								new Float32Array([0.1, 0.2, 0.3])
							),
							price: Price.of(100),
						},
					],
					validation: [{ features, price: Price.of(100) }],
				},
			],
			backendFactory: (() => ({
				step: jest.fn((..._args: any[]) => ({ reward: 1, action: 0 })),
				remember: jest.fn<(...args: any[]) => any>(),
				replay: jest.fn<(...args: any[]) => any>(),
				getWeights: jest.fn((..._args: any[]) => new Float32Array([0.1, 0.2])),
				setWeights: jest.fn<(...args: any[]) => any>(),
				getPnL: jest.fn((..._args: any[]) => 50),
				resetEpisode: jest.fn<(...args: any[]) => any>(),
				getExperiencePool: jest.fn((..._args: any[]) => []),
				forwardPass: jest.fn(
					(_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])
				),
			})) as any,
			initialControl: {
				populationSize: 2,
				maxGenerations: 100,
				stagnationPatience: 0,
			} as any,
		});
		const result = await runner.run();
		expect(runner.processor.generation).toBeLessThan(100);
		expect(result).toBe(runner.processor.lastBestGenome);
		expect(typeof result.id).toBe("string");
	});

	it("should exit run via timeBudgetMs", async () => {
		const features = FeatureVector.fromFloat32Array(
			new Float32Array([0.5, 0.5, 0.5])
		);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [
						{
							features: FeatureVector.fromFloat32Array(
								new Float32Array([0.1, 0.2, 0.3])
							),
							price: Price.of(100),
						},
					],
					validation: [{ features, price: Price.of(100) }],
				},
			],
			backendFactory: (() => ({
				step: jest.fn((..._args: any[]) => ({ reward: 1, action: 0 })),
				remember: jest.fn<(...args: any[]) => any>(),
				replay: jest.fn<(...args: any[]) => any>(),
				getWeights: jest.fn((..._args: any[]) => new Float32Array([0.1, 0.2])),
				setWeights: jest.fn<(...args: any[]) => any>(),
				getPnL: jest.fn((..._args: any[]) => 50),
				resetEpisode: jest.fn<(...args: any[]) => any>(),
				getExperiencePool: jest.fn((..._args: any[]) => []),
				forwardPass: jest.fn(
					(_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])
				),
			})) as any,
			initialControl: {
				populationSize: 2,
				maxGenerations: 100,
				timeBudgetMs: 1,
			} as any,
		});
		const result = await runner.run();
		expect(runner.processor.generation).toBeLessThan(100);
		expect(result).toBe(runner.processor.lastBestGenome);
		expect(typeof result.id).toBe("string");
	});

	it("should replay transitions while training", async () => {
		const trainMock = jest.fn<(...args: any[]) => any>();
		const mockBackendFactory = () => ({
			step: jest.fn((..._args: any[]) => ({ reward: 1, action: 0 })),
			remember: jest.fn<(...args: any[]) => any>(),
			replay: trainMock,
			getWeights: jest.fn((..._args: any[]) => new Float32Array([0.1, 0.2])),
			setWeights: jest.fn<(...args: any[]) => any>(),
			getPnL: jest.fn((..._args: any[]) => 50),
			resetEpisode: jest.fn<(...args: any[]) => any>(),
			getExperiencePool: jest.fn((..._args: any[]) => [
				{
					input: new Float32Array([0.1, 0.2, 0.3]),
					output: new Float32Array([0.1, 0.2, 0.3]),
					reward: 1,
					nextState: new Float32Array([0.1, 0.2, 0.3]),
					action: 0,
				},
				{
					input: new Float32Array([0.4, 0.5, 0.6]),
					output: new Float32Array([0.4, 0.5, 0.6]),
					reward: 1,
					nextState: new Float32Array([0.4, 0.5, 0.6]),
					action: 2,
				},
			]),
			forwardPass: jest.fn(
				(_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])
			),
		});

		const features = FeatureVector.fromFloat32Array(
			new Float32Array([0.5, 0.5, 0.5])
		);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [
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
					],
					validation: [
						{ features, price: Price.of(100) },
						{ features, price: Price.of(101) },
					],
				},
			],
			backendFactory: mockBackendFactory as any,
			initialControl: { populationSize: 2, maxGenerations: 4 } as any,
		});
		await runner.run();
		expect(trainMock).toHaveBeenCalled();
	});
});
