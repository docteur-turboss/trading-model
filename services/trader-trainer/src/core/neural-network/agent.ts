import { agentError } from "@trading-model/common/utils/errors";
import { AgentExperienceHandler } from "./agent-experience-handler";
import { NeuralNetwork } from "./neural-network";
import { ScoreTracker } from "./score-tracker";
import type {
	Experience,
	NetworkArchitecture,
	NeuralNetworkConfig,
} from "./type";

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
	private readonly _nn: NeuralNetwork;
	private readonly _scoreTracker: ScoreTracker;
	private readonly _experienceHandler: AgentExperienceHandler;

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

		this._experienceHandler = new AgentExperienceHandler(cfg);
		this._scoreTracker = new ScoreTracker();
		this._nn = new NeuralNetwork(cfg as NeuralNetworkConfig);
	}

	public addScore(score: number): void {
		this._scoreTracker.addScore(score);
	}

	public getAverageScore(): number {
		return this._scoreTracker.getAverageScore();
	}

	public getTotalScore(): number {
		return this._scoreTracker.getTotalScore();
	}

	public resetScores(): void {
		this._scoreTracker.resetScores();
	}

	public fastForward(ff: FastForwardInput): Float32Array {
		const { input, reward, nextState, done } = ff;
		const { output } = this._nn.forward(input);
		this._experienceHandler.recordExperience(
			input,
			output,
			reward,
			nextState,
			done
		);
		return output;
	}

	public getPool(): Experience[] {
		return this._experienceHandler.getPool();
	}

	public getPoolSize(): number {
		return this._experienceHandler.getPoolSize();
	}

	public forward(input: Float32Array): { output: Float32Array } {
		return this._nn.forward(input);
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

	public distributeAroundWeights(mean: number, std: number): void {
		this._nn.distributeAroundWeights(mean, std);
	}

	public clearPool(): void {
		this._experienceHandler.clearPool();
	}

	public samplePool(batchSize: number): Experience[] {
		return this._experienceHandler.samplePool(batchSize);
	}

	public learnSupervised(input: Float32Array, target: Float32Array): void {
		this._nn.train(input, target);
		this._experienceHandler.removeFromPool(input);
	}

	public learnFromPool(): void {
		this._experienceHandler.learnFromPool(this._nn);
	}

	public learnQLearning(exp: Experience, gamma = 0.99): void {
		this._experienceHandler.learnExperience(this._nn, exp, gamma);
	}
}
