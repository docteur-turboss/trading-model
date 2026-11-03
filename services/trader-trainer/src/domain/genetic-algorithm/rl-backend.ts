import {
	Cash,
	Percentage,
	Price,
	Reward,
} from "@trading-model/primitives/primitives";
import TradingAgent, { type TradingAgentConfig } from "../agent/trading-agent";
import type { FeatureVector } from "../feature-vector";
import {
	ActivationType,
	ConnectionType,
	ExperienceKind,
	InitialisationType,
} from "../neural-network/type";
import { makePRNG } from "./prng";
import type { DeepReadonly, LamarckGenome } from "./shared-types";

interface StepInput {
	features: FeatureVector;
	price: Price;
}

/**
 * A decision and what it earned. States are network inputs: market features
 * followed by the agent state (agent-state.ts).
 */
export interface Transition {
	state: Float32Array;
	action: number;
	/** Shaped (n-step) reward. */
	reward: number;
	nextState: Float32Array;
	/** The episode ended: no value to bootstrap from `nextState`. */
	done: boolean;
}

export interface RLBackend {
	forwardPass(features: FeatureVector): Float32Array;
	/**
	 * Decides and trades at this bar. `reward` is the wallet PnL earned by the
	 * previous decision (see TradingAgent.step), `action` the output unit played.
	 */
	step(input: StepInput): {
		reward: number;
		action: number;
		/** The network input the decision was taken on. */
		state: Float32Array;
	};
	/** Stores a transition in the replay buffer. */
	remember(transition: Transition): void;
	/** One minibatch update from the replay buffer, bootstrapping with `discount`. */
	replay(batchSize: number, discount: number): void;
	getWeights(): Float32Array;
	setWeights(weights: Float32Array): void;
	getPnL(): Cash;
	resetEpisode(): void;
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
	};
}

/** Run-level options of the backends, outside the genome. */
export interface BackendOptions {
	/** Show the agent its position (default true, ADR-0025). */
	observePosition?: boolean;
}

function _buildAgentConfig(
	genome: DeepReadonly<LamarckGenome>,
	rng: () => number,
	options: BackendOptions
): TradingAgentConfig {
	// Q-learning picks among a finite set of actions: sell / hold / buy.
	return {
		nnConfig: _buildNNConfig(genome, rng),
		// Each trade moves 10 % of the initial cash, whatever the asset's price,
		// and pays the Binance spot taker fee.
		wallet: {
			initialCash: Cash.of(1000),
			initialPrice: Price.of(1),
			feeRate: Percentage.of(0.001),
		},
		tradeFraction: 0.1,
		stateManagerCfg: _buildStateManagerCfg(genome.rl.discretePolicy),
		observePosition: options.observePosition ?? true,
	};
}

/**
 * Inherits the parent's trained weights when the topology still matches. A
 * mutated or crossed-over network (other layer sizes) keeps its fresh
 * initialisation: weights of another topology cannot be loaded.
 */
function _tryLamarckianInjection(
	agent: TradingAgent,
	genome: DeepReadonly<LamarckGenome>
): void {
	if (
		genome.trainedWeights &&
		genome.trainedWeights.length === agent.getWeights().length
	) {
		agent.setWeights(new Float32Array(genome.trainedWeights));
	}
}

export function makeTradingAgentBackend(
	genome: DeepReadonly<LamarckGenome>,
	rng: () => number = Math.random,
	options: BackendOptions = {}
): RLBackend {
	const cfg = _buildAgentConfig(genome, rng, options);
	const agent = new TradingAgent(cfg);
	_tryLamarckianInjection(agent, genome);

	return {
		forwardPass: (features) =>
			agent.forwardPass(features.toFloat32Array()).output,
		step: (input) => {
			const result = agent.step(input.features.toFloat32Array(), input.price);
			return {
				reward: result.reward,
				action: result.actionIndex,
				state: result.state,
			};
		},
		remember: (transition) =>
			agent.remember({
				kind: ExperienceKind.QLearning,
				input: transition.state,
				output: new Float32Array(0),
				reward: Reward.of(transition.reward),
				nextState: transition.nextState,
				done: transition.done,
				action: transition.action,
			}),
		replay: (batchSize, discount) => {
			agent.replay(batchSize, discount);
		},
		getWeights: () => agent.getWeights(),
		setWeights: (weights) => agent.setWeights(weights),
		getPnL: () => agent.wallet.getPnL(),
		resetEpisode: () => agent.resetEpisode(),
	};
}

/**
 * Builds a {@link BackendFactory} whose backends are replayable: each backend
 * gets its own PRNG, seeded from a stream derived from `networkSeed`, so the
 * same seed and the same construction order reproduce the same weights and
 * replay samples.
 */
export function makeSeededBackendFactory(
	networkSeed: number,
	options: BackendOptions = {}
): BackendFactory {
	const seedStream = makePRNG(networkSeed);
	return (genome) =>
		makeTradingAgentBackend(
			genome,
			makePRNG(Math.floor(seedStream() * 4_294_967_296)),
			options
		);
}
