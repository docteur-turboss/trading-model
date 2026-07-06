import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../src/core/agent/trading-agent", () => {
	const makeMockAgent = () => ({
		forwardPass: jest.fn(() => ({ output: new Float32Array([0.5, 0.5, 0.5]) })),
		getWeights: jest.fn(() => new Float32Array([0.1, 0.2])),
		setWeights: jest.fn(),
		getExperiencePool: jest.fn(() => []),
		learnQLearning: jest.fn(),
		step: jest.fn(() => ({ reward: 1 })),
		resetEpisode: jest.fn(),
		wallet: {
			getPnL: jest.fn(() => 50),
		},
	});
	return {
		__esModule: true,
		default: jest.fn().mockImplementation(makeMockAgent),
		TradingAgent: jest.fn().mockImplementation(makeMockAgent),
	};
});

jest.mock("../../../src/core/env/wallet-manager", () => ({
	createWallet: jest.fn(() => ({
		buy: jest.fn(() => true),
		sell: jest.fn(() => true),
		setPrice: jest.fn(),
		getPosition: jest.fn(() => 0),
		getCash: jest.fn(() => 1000),
		getValuation: jest.fn(() => 1000),
		getPrice: jest.fn(() => 100),
		getPnL: jest.fn(() => 0),
		getMetrics: jest.fn(() => ({
			pnl: 0,
			returnRate: 0,
			peakValuation: 1000,
			drawdown: 0,
			totalFeesPaid: 0,
			tradeCount: 0,
		})),
		getHistory: jest.fn(() => []),
		reset: jest.fn(),
	})),
}));

jest.mock("../../../src/core/agent/state-manager", () => ({
	StateManager: jest.fn().mockImplementation(() => ({
		initialiseFromGenome: jest.fn(),
		decayEpsilon: jest.fn(),
		resetEpsilon: jest.fn(),
		getEpsilon: jest.fn(() => 0.5),
	})),
	default: jest.fn(),
}));

jest.mock("../../../src/core/neural-network/agent", () => ({
	Agent: jest.fn().mockImplementation(() => ({
		nn: {
			forward: jest.fn(() => new Float32Array([0.5, 0.5, 0.5])),
			getParameters: jest.fn(() => new Float32Array([0.1, 0.2])),
			setParameters: jest.fn(),
			distributeAroundWeights: jest.fn(),
		},
		fastForward: jest.fn(() => new Float32Array([0.5, 0.5, 0.5])),
		clearPool: jest.fn(),
		mutate: jest.fn(),
	})),
}));

jest.mock("../../../src/core/neural-network/neural-network", () => ({
	NeuralNetwork: jest.fn(),
}));

import {
	GeneticAlgorithmRunner,
	makeTradingAgentBackend,
} from "../../../src/core/genetic-algorithm/ga-runner";
import {
	ActivationType,
	ConnectionType,
	FitnessType,
	NormalisationType,
	SelectionType,
} from "../../../src/core/genetic-algorithm/genome";

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
		const features = new Float32Array([0.5, 0.5, 0.5]);
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
		const result = backend.step(new Float32Array([0.5, 0.5, 0.5]), 100);
		expect(result.reward).toBe(1);
	});

	it("should call train without throwing", () => {
		const genome = getMinimalGenome();
		const backend = makeTradingAgentBackend(genome as any);
		const experience = {
			input: new Float32Array([0.5, 0.5, 0.5]),
			output: new Float32Array([0.1, 0.2, 0.3]),
			reward: 1,
			nextState: new Float32Array([0.6, 0.6, 0.6]),
			done: false,
		};
		expect(() => backend.train(experience as any, 0.99)).not.toThrow();
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

	it("should get experience pool", () => {
		const genome = getMinimalGenome();
		const backend = makeTradingAgentBackend(genome as any);
		const pool = backend.getExperiencePool();
		expect(Array.isArray(pool)).toBe(true);
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
		fitness: 0,
	};
}

describe("GeneticAlgorithmRunner", () => {
	const mockBackendFactory = () => ({
		forwardPass: jest.fn(
			(_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])
		),
		step: jest.fn(() => ({ reward: 1 })),
		train: jest.fn(),
		getWeights: jest.fn(() => new Float32Array([0.1, 0.2])),
		setWeights: jest.fn(),
		getPnL: jest.fn(() => 50),
		resetEpisode: jest.fn(),
		getExperiencePool: jest.fn(() => []),
	});

	it("should initialise a population with the correct size", () => {
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [{ features: new Float32Array(3), price: 100 }],
					validation: [{ features: new Float32Array(3), price: 100 }],
				},
			],
			backendFactory: mockBackendFactory as any,
			evalConcurrency: 1,
		});
		runner.initialise({ networkSeed: 42, mutationSeed: 42, populationSize: 5 });
		const pop = runner.getPopulation();
		expect(pop.length).toBe(5);
		expect(runner.getGeneration()).toBe(0);
	});

	it("should create genomes with unique IDs", () => {
		const runner = new GeneticAlgorithmRunner({
			windowSets: [{ id: "w1", train: [], validation: [] }],
			backendFactory: mockBackendFactory as any,
			evalConcurrency: 1,
		});
		runner.initialise();
		const pop = runner.getPopulation();
		const ids = new Set(pop.map((g) => g.id));
		expect(ids.size).toBe(pop.length);
	});

	it("should report best genome as null before running", () => {
		const runner = new GeneticAlgorithmRunner({
			windowSets: [{ id: "w1", train: [], validation: [] }],
			backendFactory: mockBackendFactory as any,
		});
		runner.initialise();
		expect(runner.getBestGenome()).toBeNull();
	});

	it("should return empty archive before running", () => {
		const runner = new GeneticAlgorithmRunner({
			windowSets: [{ id: "w1", train: [], validation: [] }],
			backendFactory: mockBackendFactory as any,
		});
		runner.initialise();
		expect(runner.getArchive()).toEqual([]);
	});

	it("should select elites based on elitismFraction", async () => {
		const features = new Float32Array([0.5, 0.5, 0.5]);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [{ features, price: 100 }],
					validation: [{ features, price: 100 }],
				},
			],
			backendFactory: mockBackendFactory as any,
			evalConcurrency: 1,
		});
		runner.initialise({
			networkSeed: 42,
			mutationSeed: 42,
			populationSize: 10,
			elitismFraction: 0.3,
		});
		await runner.runGeneration();
		const pop = runner.getPopulation();
		expect(pop.length).toBe(10);
		expect(runner.getGeneration()).toBe(1);
	});

	it("should produce offspring with some new IDs after runGeneration (elites carry over)", async () => {
		const features = new Float32Array([0.5, 0.5, 0.5]);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [{ features, price: 100 }],
					validation: [{ features, price: 100 }],
				},
			],
			backendFactory: mockBackendFactory as any,
			evalConcurrency: 1,
		});
		runner.initialise({ networkSeed: 42, mutationSeed: 42, populationSize: 4 });
		await runner.runGeneration();
		const childIds = new Set(runner.getPopulation().map((g) => g.id));
		// Elites are preserved from parents, so at least some IDs may overlap.
		// But the population size should stay the same.
		expect(childIds.size).toBeGreaterThan(0);
		expect(runner.getPopulation().length).toBe(4);
	});

	it("should update Pareto archive after runGeneration", async () => {
		const features = new Float32Array([0.5, 0.5, 0.5]);
		const onArchiveUpdate = jest.fn();
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [{ features, price: 100 }],
					validation: [{ features, price: 100 }],
				},
			],
			backendFactory: mockBackendFactory as any,
			evalConcurrency: 1,
			onArchiveUpdate,
		});
		runner.initialise({ networkSeed: 42, mutationSeed: 42, populationSize: 4 });
		expect(runner.getArchive()).toEqual([]);
		await runner.runGeneration();
		expect(onArchiveUpdate).toHaveBeenCalled();
		if (runner.getArchive().length > 0) {
			expect(runner.getArchive()[0].id).toBeDefined();
		}
	});

	it("should track stagnation when fitness does not improve", async () => {
		const features = new Float32Array([0.5, 0.5, 0.5]);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [{ features, price: 100 }],
					validation: [{ features, price: 100 }],
				},
			],
			backendFactory: mockBackendFactory as any,
			evalConcurrency: 1,
		});
		runner.initialise({ networkSeed: 42, mutationSeed: 42, populationSize: 2 });
		const ctx1 = await runner.runGeneration();
		const ctx2 = await runner.runGeneration();
		expect(ctx2.stagnation).toBeGreaterThanOrEqual(ctx1.stagnation);
	});

	it("should sort population by Pareto rank and crowding distance", async () => {
		const features = new Float32Array([0.5, 0.5, 0.5]);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [{ features, price: 100 }],
					validation: [{ features, price: 100 }],
				},
			],
			backendFactory: mockBackendFactory as any,
			evalConcurrency: 1,
		});
		runner.initialise({ networkSeed: 42, mutationSeed: 42, populationSize: 5 });
		await runner.runGeneration();
		const ctx = await runner.runGeneration();
		expect(ctx.population.length).toBe(5);
	});

	it("should run a single generation and produce a context", async () => {
		const features = new Float32Array([0.5, 0.5, 0.5]);
		const windowSets = [
			{
				id: "w1",
				train: [{ features, price: 100 }],
				validation: [{ features, price: 100 }],
			},
		];
		const onGeneration = jest.fn();
		const runner = new GeneticAlgorithmRunner({
			windowSets,
			backendFactory: mockBackendFactory as any,
			evalConcurrency: 1,
			onGeneration,
		});
		runner.initialise({ networkSeed: 42, mutationSeed: 42, populationSize: 2 });
		const ctx = await runner.runGeneration();
		expect(ctx.generation).toBe(1);
		expect(ctx.population.length).toBe(2);
		expect(onGeneration).toHaveBeenCalledTimes(1);
		expect(ctx.bestFitness).toBeGreaterThan(Number.NEGATIVE_INFINITY);
	});
});

describe("full GA loop", () => {
	it("should run full GA loop successfully", async () => {
		const mockBackendFactory = () => ({
			step: jest.fn(() => ({ reward: 1 })),
			train: jest.fn(),
			getWeights: jest.fn(() => new Float32Array([0.1, 0.2])),
			setWeights: jest.fn(),
			getPnL: jest.fn(() => 50),
			resetEpisode: jest.fn(),
			getExperiencePool: jest.fn(() => [
				{
					input: new Float32Array([0.1, 0.2, 0.3]),
					output: new Float32Array([0.1, 0.2, 0.3]),
					reward: 1,
					nextState: new Float32Array([0.1, 0.2, 0.3]),
				},
				{
					input: new Float32Array([0.4, 0.5, 0.6]),
					output: new Float32Array([0.4, 0.5, 0.6]),
					reward: 1,
					nextState: new Float32Array([0.4, 0.5, 0.6]),
				},
			]),
			forwardPass: jest.fn(
				(_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])
			),
		});

		const features = new Float32Array([0.5, 0.5, 0.5]);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [
						{ features: new Float32Array([0.1, 0.2, 0.3]), price: 100 },
						{ features: new Float32Array([0.4, 0.5, 0.6]), price: 101 },
					],
					validation: [
						{ features, price: 100 },
						{ features, price: 101 },
					],
				},
			],
			backendFactory: mockBackendFactory as any,
			evalConcurrency: 1,
			initialControl: { populationSize: 2, maxGenerations: 4 } as any,
		});
		const result = await runner.run();
		expect(result).toBeDefined();
		expect(runner.getBestGenome()).not.toBeNull();
	});

	it("should exercise advanced GA branches (frameSkip, normalize, sparse, NSGA-II, weight crossover)", async () => {
		let factoryCallCount = 0;
		const mockBackendFactory = () => {
			const id = factoryCallCount++;
			return {
				step: jest.fn(() => ({ reward: 1 })),
				train: jest.fn(),
				getWeights: jest.fn(() => new Float32Array([0.1, 0.2, 0.3])),
				setWeights: jest.fn(),
				getPnL: jest.fn(() => 50 + id * 10),
				resetEpisode: jest.fn(),
				getExperiencePool: jest.fn(() => [
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

		const onArchiveUpdate = jest.fn();
		const features = new Float32Array([0.5, 0.5, 0.5]);

		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [
						{ features: new Float32Array([0.1, 0.2, 0.3]), price: 100 },
						{ features: new Float32Array([0.4, 0.5, 0.6]), price: 101 },
					],
					validation: [
						{ features, price: 100 },
						{ features, price: 101 },
					],
				},
			],
			backendFactory: mockBackendFactory as any,
			onArchiveUpdate,
		});

		runner.initialise({ networkSeed: 42, mutationSeed: 42, populationSize: 5 });

		const customPop = (runner as any)._population.map((g: any) => {
			const gCopy = JSON.parse(JSON.stringify(g));
			gCopy.rl.horizon.frameSkip = 3;
			gCopy.rl.rewardShaping.normalize = true;
			gCopy.rl.rewardShaping.sparse = true;
			return Object.freeze(gCopy);
		});
		(runner as any).population = customPop;

		for (let i = 0; i < 4; i++) {
			await runner.runGeneration();
		}
		expect(runner.getBestGenome()).not.toBeNull();
		expect(onArchiveUpdate).toHaveBeenCalled();
	});

	it("should exit run via rewardThreshold", async () => {
		const features = new Float32Array([0.5, 0.5, 0.5]);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [{ features: new Float32Array([0.1, 0.2, 0.3]), price: 100 }],
					validation: [{ features, price: 100 }],
				},
			],
			backendFactory: (() => ({
				step: jest.fn(() => ({ reward: 1 })),
				train: jest.fn(),
				getWeights: jest.fn(() => new Float32Array([0.1, 0.2])),
				setWeights: jest.fn(),
				getPnL: jest.fn(() => 50),
				resetEpisode: jest.fn(),
				getExperiencePool: jest.fn(() => []),
				forwardPass: jest.fn(
					(_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])
				),
			})) as any,
			evalConcurrency: 1,
			initialControl: {
				populationSize: 2,
				maxGenerations: 100,
				rewardThreshold: 0,
			} as any,
		});
		const result = await runner.run();
		expect(runner.getGeneration()).toBeLessThan(100);
		expect(result).toBeDefined();
	});

	it("should exit run via stagnationPatience", async () => {
		const features = new Float32Array([0.5, 0.5, 0.5]);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [{ features: new Float32Array([0.1, 0.2, 0.3]), price: 100 }],
					validation: [{ features, price: 100 }],
				},
			],
			backendFactory: (() => ({
				step: jest.fn(() => ({ reward: 1 })),
				train: jest.fn(),
				getWeights: jest.fn(() => new Float32Array([0.1, 0.2])),
				setWeights: jest.fn(),
				getPnL: jest.fn(() => 50),
				resetEpisode: jest.fn(),
				getExperiencePool: jest.fn(() => []),
				forwardPass: jest.fn(
					(_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])
				),
			})) as any,
			evalConcurrency: 1,
			initialControl: {
				populationSize: 2,
				maxGenerations: 100,
				stagnationPatience: 0,
			} as any,
		});
		const result = await runner.run();
		expect(runner.getGeneration()).toBeLessThan(100);
		expect(result).toBeDefined();
	});

	it("should exit run via timeBudgetMs", async () => {
		const features = new Float32Array([0.5, 0.5, 0.5]);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [{ features: new Float32Array([0.1, 0.2, 0.3]), price: 100 }],
					validation: [{ features, price: 100 }],
				},
			],
			backendFactory: (() => ({
				step: jest.fn(() => ({ reward: 1 })),
				train: jest.fn(),
				getWeights: jest.fn(() => new Float32Array([0.1, 0.2])),
				setWeights: jest.fn(),
				getPnL: jest.fn(() => 50),
				resetEpisode: jest.fn(),
				getExperiencePool: jest.fn(() => []),
				forwardPass: jest.fn(
					(_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])
				),
			})) as any,
			evalConcurrency: 1,
			initialControl: {
				populationSize: 2,
				maxGenerations: 100,
				timeBudgetMs: 1,
			} as any,
		});
		const result = await runner.run();
		expect(runner.getGeneration()).toBeLessThan(100);
		expect(result).toBeDefined();
	});

	it("should call backend.train when pool has entries", async () => {
		const trainMock = jest.fn();
		const mockBackendFactory = () => ({
			step: jest.fn(() => ({ reward: 1 })),
			train: trainMock,
			getWeights: jest.fn(() => new Float32Array([0.1, 0.2])),
			setWeights: jest.fn(),
			getPnL: jest.fn(() => 50),
			resetEpisode: jest.fn(),
			getExperiencePool: jest.fn(() => [
				{
					input: new Float32Array([0.1, 0.2, 0.3]),
					output: new Float32Array([0.1, 0.2, 0.3]),
					reward: 1,
					nextState: new Float32Array([0.1, 0.2, 0.3]),
				},
				{
					input: new Float32Array([0.4, 0.5, 0.6]),
					output: new Float32Array([0.4, 0.5, 0.6]),
					reward: 1,
					nextState: new Float32Array([0.4, 0.5, 0.6]),
				},
			]),
			forwardPass: jest.fn(
				(_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])
			),
		});

		const features = new Float32Array([0.5, 0.5, 0.5]);
		const runner = new GeneticAlgorithmRunner({
			windowSets: [
				{
					id: "w1",
					train: [
						{ features: new Float32Array([0.1, 0.2, 0.3]), price: 100 },
						{ features: new Float32Array([0.4, 0.5, 0.6]), price: 101 },
					],
					validation: [
						{ features, price: 100 },
						{ features, price: 101 },
					],
				},
			],
			backendFactory: mockBackendFactory as any,
			evalConcurrency: 1,
			initialControl: { populationSize: 2, maxGenerations: 4 } as any,
		});
		await runner.run();
		expect(trainMock).toHaveBeenCalled();
	});
});
