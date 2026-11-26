import { makePRNG } from "@trading-model/crypto/prng";
import { barsSinceInput } from "@trading-model/model-runtime/agent/decision-events";
import type { FeatureVector } from "@trading-model/model-runtime/feature-vector";
import { ExperienceKind } from "@trading-model/model-runtime/neural-network/type";
import {
	policyAgentConfig,
	policyNetworkConfig,
} from "@trading-model/model-runtime/replay";
import type { Cash, Price } from "@trading-model/primitives/primitives";
import { Reward } from "@trading-model/primitives/primitives";
import { TradingAgent, type TradingAgentConfig } from "../agent/trading-agent";
import type { DeepReadonly, LamarckGenome } from "./shared-types";

interface StepInput {
	features: FeatureVector;
	/** Close of the bar: the wallet is marked to it. */
	price: Price;
	/** Where the decision fills (MarketStep.fillPrice); `price` when absent. */
	fillPrice?: Price;
}

/**
 * Simulator parameters of every training and evaluation episode, written in the
 * manifest `replay` block (ADR-0079). Each trade moves `tradeFraction` of the
 * initial cash, whatever the asset's price, and pays the Binance spot taker fee
 * plus `executionCostRate` (ADR-0066): 5 bps of half-spread and slippage, well
 * above the half-spread of the liquid spot pairs.
 */
export const SIMULATOR_PARAMS = {
	initialCash: 1000,
	feeRate: 0.001,
	executionCostRate: 0.0005,
	tradeFraction: 0.1,
	observePosition: true,
} as const;

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
	/** γ^bars elapsed to `nextState` (event-driven genomes); absent: the replay's. */
	discount?: number;
	/** The episode ended: no value to bootstrap from `nextState`. */
	done: boolean;
}

export interface RLBackend {
	forwardPass(features: FeatureVector): Float32Array;
	/**
	 * Decides and trades at this bar. `reward` is the wallet PnL earned by the
	 * previous decision (see TradingAgent.step), `action` the output unit played.
	 */
	step(
		input: StepInput,
		/** Bars since the previous decision, event-driven genomes only. */
		barsSince?: number
	): {
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
	/** Wallet PnL, marked to `mark` when given. */
	getPnL(mark?: Price): Cash;
	resetEpisode(): void;
}

export type BackendFactory = (genome: DeepReadonly<LamarckGenome>) => RLBackend;

function _buildNNConfig(
	genome: DeepReadonly<LamarckGenome>,
	rng: () => number
): TradingAgentConfig["nnConfig"] {
	return {
		...policyNetworkConfig(genome.network),
		learningRate: genome.rl.learningRate,
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

/** The costs of a fill that depend on the asset class (ADR-0083). */
export interface SimulatorCosts {
	feeRate: number;
	executionCostRate: number;
}

/** Run-level options of the backends, outside the genome. */
interface BackendOptions {
	/** Costs of the asset class; absent: `SIMULATOR_PARAMS`. */
	costs?: SimulatorCosts;
	/** Show the agent its position (default true, ADR-0025). */
	observePosition?: boolean;
}

function _buildAgentConfig(
	genome: DeepReadonly<LamarckGenome>,
	rng: () => number,
	options: BackendOptions
): TradingAgentConfig {
	return {
		...policyAgentConfig(genome.network, {
			...SIMULATOR_PARAMS,
			...options.costs,
			observePosition:
				options.observePosition ?? SIMULATOR_PARAMS.observePosition,
		}),
		nnConfig: _buildNNConfig(genome, rng),
		stateManagerCfg: _buildStateManagerCfg(genome.rl.discretePolicy),
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
		genome.trainedWeights.length === agent.parameterCount()
	) {
		agent.setWeights(new Float32Array(genome.trainedWeights));
	}
}

/**
 * Market steps are shared by every genome of every generation and never change
 * once built; the agent copies its input (observe), so one encoding per step.
 */
const ENCODED = new WeakMap<FeatureVector, Float32Array>();

function encoded(features: FeatureVector): Float32Array {
	let data = ENCODED.get(features);
	if (!data) {
		data = features.toFloat32Array();
		ENCODED.set(features, data);
	}
	return data;
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
		forwardPass: (features) => agent.forwardPass(encoded(features)).output,
		step: (input, barsSince) => {
			const result = agent.step(
				encoded(input.features),
				input.price,
				input.fillPrice,
				barsSinceInput(barsSince)
			);
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
				...(transition.discount !== undefined && {
					discount: transition.discount,
				}),
			}),
		replay: (batchSize, discount) => {
			agent.replay(batchSize, discount);
		},
		getWeights: () => agent.getWeights(),
		setWeights: (weights) => agent.setWeights(weights),
		getPnL: (mark) => {
			if (mark !== undefined) {
				agent.wallet.setPrice(mark);
			}
			return agent.wallet.getPnL();
		},
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
