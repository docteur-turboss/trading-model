import { Cash, Price, Volume } from "@trading-model/primitives/primitives";
import { ActionSpace } from "../agent/action-types";
import TradingAgent, { type TradingAgentConfig } from "../agent/trading-agent";
import type { FeatureVector } from "../feature-vector";
import type { Experience } from "../neural-network/type";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
} from "../neural-network/type";
import { makePRNG } from "./prng";
import type { DeepReadonly, LamarckGenome } from "./shared-types";

interface StepInput {
	features: FeatureVector;
	price: Price;
}

export interface RLBackend {
	forwardPass(features: FeatureVector): Float32Array;
	step(input: StepInput): { reward: number };
	train(experience: Experience, gamma: number): void;
	getWeights(): Float32Array;
	setWeights(weights: Float32Array): void;
	getPnL(): Cash;
	resetEpisode(): void;
	getExperiencePool(): Experience[];
}

export type BackendFactory = (genome: DeepReadonly<LamarckGenome>) => RLBackend;

function _buildNNConfig(
	genome: DeepReadonly<LamarckGenome>,
	rng: () => number
): TradingAgentConfig["nnConfig"] {
	return {
		neuronsByLayer: [
			genome.network.inputDim,
			...genome.network.hiddenLayers.map((layer) => layer.neurons),
			genome.network.outputDim,
		],
		// Q-values are unbounded, so the output layer stays linear.
		activationType: [
			...genome.network.hiddenLayers.map((layer) => layer.activation),
			ActivationType.Linear,
		],
		connectionType:
			genome.network.hiddenLayers[0]?.connectionType ??
			ConnectionType.FullyConnected,
		biasInitialisationType:
			genome.network.hiddenLayers[0]?.biasType ?? InitialisationType.Random,
		normalisationType: genome.network.normalization,
		learningRate: genome.rl.learningRate,
		enablePool: true,
		poolMaxSize: genome.rl.replayBuffer.bufferSize,
		perEnabled: genome.rl.replayBuffer.prioritized,
		perAlpha: genome.rl.replayBuffer.alphaPER,
		perBeta: genome.rl.replayBuffer.betaPER,
		perBetaAnneal: genome.rl.replayBuffer.betaAnneal,
		rng,
	};
}

function _buildStateManagerCfg(
	dp: DeepReadonly<LamarckGenome["rl"]["discretePolicy"]>
): TradingAgentConfig["stateManagerCfg"] {
	return {
		epsilonStart: dp.epsilonStart,
		epsilonMin: dp.epsilonMin,
		epsilonDecay: dp.epsilonDecay,
		temperature: dp.temperature,
	};
}

function _buildAgentConfig(
	genome: DeepReadonly<LamarckGenome>,
	rng: () => number
): TradingAgentConfig {
	const useContinuous = genome.rl.continuousPolicy?.type !== undefined;
	return {
		nnConfig: _buildNNConfig(genome, rng),
		wallet: { initialCash: Cash.of(1000), initialPrice: Price.of(1) },
		actionSpace: useContinuous ? ActionSpace.Continuous : ActionSpace.Discrete,
		tradeAmount: Volume.of(1),
		stateManagerCfg: _buildStateManagerCfg(genome.rl.discretePolicy),
	};
}

function _tryLamarckianInjection(
	agent: TradingAgent,
	genome: DeepReadonly<LamarckGenome>
): void {
	if (genome.trainedWeights) {
		agent.setWeights(new Float32Array(genome.trainedWeights));
	}
}

function _makeTrainFn(agent: TradingAgent): RLBackend["train"] {
	return (experience, gamma) => {
		agent.learnQLearning(experience, gamma);
	};
}

export function makeTradingAgentBackend(
	genome: DeepReadonly<LamarckGenome>,
	rng: () => number = Math.random
): RLBackend {
	const cfg = _buildAgentConfig(genome, rng);
	const agent = new TradingAgent(cfg);
	_tryLamarckianInjection(agent, genome);

	return {
		forwardPass: (features) =>
			agent.forwardPass(features.toFloat32Array()).output,
		step: (input) => agent.step(input.features.toFloat32Array(), input.price),
		train: _makeTrainFn(agent),
		getWeights: () => agent.getWeights(),
		setWeights: (weights) => agent.setWeights(weights),
		getPnL: () => agent.wallet.getPnL(),
		resetEpisode: () => agent.resetEpisode(),
		getExperiencePool: () => agent.getExperiencePool(),
	};
}

/**
 * Builds a {@link BackendFactory} whose backends are replayable: each backend
 * gets its own PRNG, seeded from a stream derived from `networkSeed`, so the
 * same seed and the same construction order reproduce the same weights and
 * replay samples.
 */
export function makeSeededBackendFactory(networkSeed: number): BackendFactory {
	const seedStream = makePRNG(networkSeed);
	return (genome) =>
		makeTradingAgentBackend(
			genome,
			makePRNG(Math.floor(seedStream() * 4_294_967_296))
		);
}
