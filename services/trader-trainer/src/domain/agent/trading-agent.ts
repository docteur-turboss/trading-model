import {
	TradingAgent as PolicyAgent,
	type TradingAgentConfig as PolicyAgentConfig,
} from "@trading-model/model-runtime/agent/trading-agent";
import { agentError } from "@trading-model/model-runtime/errors";
import type {
	NeuralNetworkConfig,
	QLearningExperience,
} from "@trading-model/model-runtime/neural-network/type";
import { AgentExperienceHandler } from "../neural-network/agent-experience-handler";
import { NeuralNetwork } from "../neural-network/neural-network";

export interface TradingAgentConfig extends Omit<PolicyAgentConfig, "rng"> {
	nnConfig: NeuralNetworkConfig;
}

/** The model-runtime agent plus what training needs: experience replay and weights. */
export class TradingAgent extends PolicyAgent {
	private readonly _nn: NeuralNetwork;
	private readonly _experience: AgentExperienceHandler;

	constructor(cfg: TradingAgentConfig) {
		if (cfg.nnConfig.neuronsByLayer.length < 2) {
			throw agentError(
				"neuronsByLayer must contain at least 2 entries (input + output)."
			);
		}
		const nn = new NeuralNetwork(cfg.nnConfig);
		super({ ...cfg, rng: cfg.nnConfig.rng }, nn);
		this._nn = nn;
		this._experience = new AgentExperienceHandler(cfg.nnConfig);
	}

	/** Stores a transition in the replay buffer. */
	public remember(exp: QLearningExperience): void {
		this._experience.remember(exp);
	}

	/** One experience-replay update; returns the transitions trained on. */
	public replay(batchSize: number, discount: number): number {
		return this._experience.replay(this._nn, batchSize, discount);
	}

	public getWeights(): Float32Array {
		return this._nn.getWeights();
	}

	public setWeights(weights: Float32Array): void {
		this._nn.setWeights(weights);
	}

	public parameterCount(): number {
		return this._nn.parameterCount();
	}

	public override resetEpisode(): void {
		super.resetEpisode();
		this._experience.clearPool();
	}
}
