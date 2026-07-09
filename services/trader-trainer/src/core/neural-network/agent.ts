import { agentError } from "@trading-model/common/utils/errors";
import { AgentExperienceHandler } from "./agent-experience-handler";
import { NeuralNetwork } from "./neural-network";
import { ScoreTracker } from "./score-tracker";
import type { NetworkArchitecture, NeuralNetworkConfig } from "./type";

/**
 * High-level agent that wraps a {@link NeuralNetwork} and adds:
 * - Scoring / fitness bookkeeping
 * - One-step fast-forward with optional experience replay pool
 * - Supervised backpropagation and Q-learning update helpers
 *
 * **Responsibility split**
 * | Concern | Owner |
 * |---|---|
 * | Weight init / serialisation / mutation | `NeuralNetwork` |
 * | Forward pass / backprop / loss | `NeuralNetwork` |
 * | Score / fitness tracking | `ScoreTracker` |
 * | Experience replay pool | `ExperiencePool` |
 * |
 */
export interface FastForwardInput {
	input: Float32Array;
	reward?: number;
	nextState?: Float32Array;
	done?: boolean;
}

export class Agent {
	readonly nn: NeuralNetwork;
	readonly scores: ScoreTracker;
	readonly experience: AgentExperienceHandler;

	/**
	 * @param cfg - Architecture settings consumed by the agent layer;
	 *   forwarded to {@link NeuralNetwork} with defaults for the rest.
	 */
	constructor(readonly cfg: NetworkArchitecture) {
		if (cfg.neuronsByLayer.length < 2) {
			throw agentError(
				"neuronsByLayer must contain at least 2 entries (input + output)."
			);
		}

		this.experience = new AgentExperienceHandler(cfg);
		this.scores = new ScoreTracker();
		this.nn = new NeuralNetwork(cfg as NeuralNetworkConfig);
	}

	/**
	 * Runs a forward pass through the neural network and records the
	 * experience in the replay pool if reward/nextState are provided.
	 */
	public fastForward(ff: FastForwardInput): Float32Array {
		const { input, reward, nextState, done } = ff;
		const { output } = this.nn.forward(input);
		this.experience.recordExperience(input, output, reward, nextState, done);
		return output;
	}

	/**
	 * Trains on a single supervised sample and removes it from the pool.
	 */
	public learnSupervised(input: Float32Array, target: Float32Array): void {
		this.nn.train(input, target);
		this.experience.removeFromPool(input);
	}
}
