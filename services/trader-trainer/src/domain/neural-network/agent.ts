import { agentError } from "../../shared/errors";
import { AgentExperienceHandler } from "./agent-experience-handler";
import { NeuralNetwork } from "./neural-network";
import type { NetworkArchitecture, NeuralNetworkConfig } from "./type";

/**
 * Pairs a {@link NeuralNetwork} (forward pass, backprop, weights) with its
 * experience replay pool ({@link AgentExperienceHandler}).
 */
export class Agent {
	readonly nn: NeuralNetwork;
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
		this.nn = new NeuralNetwork(cfg as NeuralNetworkConfig);
	}
}
