import {
	TradingAgent as PolicyAgent,
	type TradingAgentConfig as PolicyAgentConfig,
} from "@trading-model/model-runtime/agent/trading-agent";
import type {
	NeuralNetworkConfig,
	QLearningExperience,
} from "@trading-model/model-runtime/neural-network/type";
import { Agent } from "../neural-network/agent";

export interface TradingAgentConfig extends Omit<PolicyAgentConfig, "rng"> {
	nnConfig: NeuralNetworkConfig;
}

/** The model-runtime agent plus what training needs: experience replay and weights. */
export class TradingAgent extends PolicyAgent {
	private readonly _agent: Agent;

	constructor(cfg: TradingAgentConfig) {
		const agent = new Agent(cfg.nnConfig);
		super({ ...cfg, rng: cfg.nnConfig.rng }, agent.nn);
		this._agent = agent;
	}

	/** Stores a transition in the replay buffer. */
	public remember(exp: QLearningExperience): void {
		this._agent.experience.remember(exp);
	}

	/** One experience-replay update; returns the transitions trained on. */
	public replay(batchSize: number, discount: number): number {
		return this._agent.experience.replay(this._agent.nn, batchSize, discount);
	}

	public getWeights(): Float32Array {
		return this._agent.nn.getWeights();
	}

	public setWeights(weights: Float32Array): void {
		this._agent.nn.setWeights(weights);
	}

	public parameterCount(): number {
		return this._agent.nn.parameterCount();
	}

	public override resetEpisode(): void {
		super.resetEpisode();
		this._agent.experience.clearPool();
	}
}
