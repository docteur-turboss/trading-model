import { logger } from "@trading-model/common/config/logger";
import { Cash, Price, Volume } from "@trading-model/common/domain/primitives";
import type { Experience } from "../../core/neural-network/type";
import { ActionSpace } from "../agent/action-types";
import TradingAgent, { type TradingAgentConfig } from "../agent/trading-agent";
import type { FeatureVector } from "../feature-vector";
import { ConnectionType, InitialisationType } from "../neural-network/type";
import type { DeepReadonly, LamarckGenome } from "./shared-types";

export interface RLBackend {
	forwardPass(features: FeatureVector): Float32Array;
	step(features: FeatureVector, price: Price): { reward: number };
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
	rb: DeepReadonly<LamarckGenome["rl"]["replayBuffer"]>
): TradingAgentConfig["nnConfig"] {
	return {
		neuronsByLayer: [
			genome.network.inputDim,
			...genome.network.hiddenLayers.map((layer) => layer.neurons),
			genome.network.outputDim,
		],
		activationType: genome.network.hiddenLayers.map(
			(layer) => layer.activation
		),
		connectionType:
			genome.network.hiddenLayers[0]?.connectionType ??
			ConnectionType.FullyConnected,
		biasInitialisationType:
			genome.network.hiddenLayers[0]?.biasType ?? InitialisationType.Random,
		normalisationType: genome.network.normalization,
		enablePool: true,
		poolMaxSize: rb.bufferSize,
	};
}

function _buildStateManagerCfg(
	dp: DeepReadonly<LamarckGenome["rl"]["discretePolicy"]>,
	gamma: number
): TradingAgentConfig["stateManagerCfg"] {
	return {
		epsilonStart: dp.epsilonStart,
		epsilonMin: dp.epsilonMin,
		epsilonDecay: dp.epsilonDecay,
		gamma,
	};
}

function _buildAgentConfig(
	genome: DeepReadonly<LamarckGenome>
): TradingAgentConfig {
	return {
		nnConfig: _buildNNConfig(genome, genome.rl.replayBuffer),
		wallet: { initialCash: Cash.of(1000), initialPrice: Price.of(1) },
		actionSpace: ActionSpace.Discrete,
		tradeAmount: Volume.of(1),
		stateManagerCfg: _buildStateManagerCfg(
			genome.rl.discretePolicy,
			genome.rl.gamma
		),
	};
}

function _tryLamarckianInjection(
	agent: TradingAgent,
	genome: DeepReadonly<LamarckGenome>
): void {
	if (genome.trainedWeights) {
		try {
			agent.setWeights(new Float32Array(genome.trainedWeights));
		} catch {
			logger.warn("Failed to inject Lamarckian weights — architecture mismatch");
		}
	}
}

function _makeTrainFn(agent: TradingAgent): RLBackend["train"] {
	return (experience, gamma) => {
		try {
			agent.learnQLearning(experience, gamma);
		} catch {
			// Q-learning error skipped
		}
	};
}

export function makeTradingAgentBackend(
	genome: DeepReadonly<LamarckGenome>
): RLBackend {
	const cfg = _buildAgentConfig(genome);
	const agent = new TradingAgent(cfg);
	_tryLamarckianInjection(agent, genome);

	return {
		forwardPass: (features) => agent.forwardPass(features.toFloat32Array()).output,
		step: (features, price) => agent.step(features.toFloat32Array(), price),
		train: _makeTrainFn(agent),
		getWeights: () => agent.getWeights(),
		setWeights: (weights) => agent.setWeights(weights),
		getPnL: () => agent.wallet.getPnL(),
		resetEpisode: () => agent.resetEpisode(),
		getExperiencePool: () => agent.getExperiencePool(),
	};
}
