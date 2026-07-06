import { AppError, agentError } from "@trading-model/common/utils/errors";

import { NeuralNetwork } from "./neural-network";
import type {
	Experience,
	NetworkArchitecture,
	NeuralNetworkConfig,
} from "./type";
import { createExperiencePool, type IExperiencePool } from "./experience-pool";
import { ScoreTracker } from "./score-tracker";

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
	private readonly _pool: IExperiencePool;

	/**
	 * @param cfg - Architecture settings consumed by the agent layer;
	 *   forwarded to {@link NeuralNetwork} with defaults for the rest.
	 */
	constructor(readonly cfg: NetworkArchitecture) {
		if (cfg.neuronsByLayer.length < 2) {
			throw agentError(
				"neuronsByLayer must contain at least 2 entries (input + output).",
			);
		}

		const enablePool = cfg.enablePool ?? true;
		const poolMaxSize = cfg.poolMaxSize ?? 10_000;
		this._pool = createExperiencePool(enablePool, poolMaxSize);
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

	private _buildExperience(
		input: Float32Array,
		output: Float32Array,
		reward?: number,
		nextState?: Float32Array,
		done?: boolean
	): Experience {
		return reward !== undefined && nextState !== undefined
			? { kind: "qlearning", input, output: output.slice(), reward, nextState, done: done ?? false }
			: { kind: "bare", input, output: output.slice() };
	}

	public fastForward(ff: FastForwardInput): Float32Array {
		const { input, reward, nextState, done } = ff;
		const { output } = this._nn.forward(input);
		this._pool.add(this._buildExperience(input, output, reward, nextState, done));
		return output;
	}

	public getPool(): Experience[] {
		return this._pool.getPool();
	}

	public getPoolSize(): number {
		return this._pool.getPoolSize();
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
		this._pool.clearPool();
	}

	public samplePool(batchSize: number): Experience[] {
		return this._pool.samplePool(batchSize);
	}

	public learnSupervised(input: Float32Array, target: Float32Array): void {
		this._nn.train(input, target);
		this._pool.remove(input);
	}

	public learnFromPool(): void {
		for (const exp of this._pool.values()) {
			if (exp.kind === "supervised") {
				this._nn.train(exp.input, exp.target);
			}
		}
		this._pool.clearPool();
	}

	public learnQLearning(exp: Experience, gamma = 0.99): void {
		if (exp.kind !== "qlearning") {
			throw agentError(
				"Q-learning requires `reward` and `nextState` in the experience.",
			);
		}
		const target = this._computeQTarget(exp, gamma);
		this._nn.train(exp.input, target);
		this._pool.remove(exp.input);
	}

	private _computeQTarget(exp: Experience, gamma: number): Float32Array {
		const target = exp.output.slice();
		const qExp = exp as import("./type").QLearningExperience;
		const nextQ = this._nn.forward(qExp.nextState).output;
		const maxNextQ = qExp.done ? 0 : Math.max(...nextQ);
		const actionIdx = target.indexOf(Math.max(...target));
		target[actionIdx] = qExp.reward + gamma * maxNextQ;
		return target;
	}
}
