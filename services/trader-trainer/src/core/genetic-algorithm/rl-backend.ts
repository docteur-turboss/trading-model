import type { Experience } from "../../core/neural-network/type";
import TradingAgent, { type TradingAgentConfig } from "../agent/trading-agent";
import type { DeepReadonly, LamarckGenome } from "./shared-types";

export interface RLBackend {
	forwardPass(features: Float32Array): Float32Array;
	step(features: Float32Array, price: number): { reward: number };
	train(experience: Experience, gamma: number): void;
	getWeights(): Float32Array;
	setWeights(weights: Float32Array): void;
	getPnL(): number;
	resetEpisode(): void;
	getExperiencePool(): Experience[];
}

export type BackendFactory = (genome: DeepReadonly<LamarckGenome>) => RLBackend;

function _buildAgentConfig(
	genome: DeepReadonly<LamarckGenome>
): TradingAgentConfig {
	const dp = genome.rl.discretePolicy;
	const rb = genome.rl.replayBuffer;

	return {
		nnConfig: {
			neuronsByLayer: [
				genome.network.inputDim,
				...genome.network.hiddenLayers.map((layer) => layer.neurons),
				genome.network.outputDim,
			],
			activationType: genome.network.hiddenLayers.map(
				(layer) => layer.activation
			),
			connectionType:
				genome.network.hiddenLayers[0]?.connectionType ?? "fully-connected",
			biasInitialisationType:
				genome.network.hiddenLayers[0]?.biasType ?? "random",
			normalisationType: genome.network.normalization,
			enablePool: true,
			poolMaxSize: rb.bufferSize,
		},
		wallet: { initialCash: 1000, initialPrice: 1 },
		actionSpace: "discrete",
		tradeAmount: 1,
		stateManagerCfg: {
			epsilonStart: dp.epsilonStart,
			epsilonMin: dp.epsilonMin,
			epsilonDecay: dp.epsilonDecay,
			gamma: genome.rl.gamma,
		},
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
			/* architecture mismatch after structural mutation */
		}
	}
}

export function makeTradingAgentBackend(
	genome: DeepReadonly<LamarckGenome>
): RLBackend {
	const cfg = _buildAgentConfig(genome);
	const agent = new TradingAgent(cfg);
	_tryLamarckianInjection(agent, genome);

	return {
		forwardPass: (features) => agent.forwardPass(features).output,
		step: (features, price) => agent.step(features, price),
		train: (experience, gamma) => {
			try {
				agent.learnQLearning(experience, gamma);
			} catch {
				/* Q-learning error skipped */
			}
		},
		getWeights: () => agent.getWeights(),
		setWeights: (weights) => agent.setWeights(weights),
		getPnL: () => agent.wallet.getPnL(),
		resetEpisode: () => agent.resetEpisode(),
		getExperiencePool: () => agent.getExperiencePool(),
	};
}
