import { AppError, ErrorCodes } from "@trading-model/common/utils/errors";

import { NeuralNetwork } from "./neural-network";
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
 * | Score / fitness tracking | `Agent` |
 * | Experience replay pool | `Agent` |
 * |
 */
export class Agent {
	private readonly _nn: NeuralNetwork;

	/** Accumulated scores added via {@link addScore}. */
	private _scores: number[] = [];

	/** Experiences collected by {@link fastForward}. */
	private _poolMap = new Map<number, Experience>();

	/** Maps input Float32Array to pool entry ID for O(1) removal. */
	private _poolInputToId = new WeakMap<Float32Array, number>();

	/** Auto-incrementing counter for pool entry IDs. */
	private _nextPoolId = 0;

	/** Maximum number of experiences kept in the pool (FIFO). */
	private readonly _poolMaxSize: number;

	/** Whether the pool is active. */
	private readonly _enablePool: boolean;

	/**
	 * @param cfg - Architecture settings consumed by the agent layer;
	 *   forwarded to {@link NeuralNetwork} with defaults for the rest.
	 */
	constructor(readonly cfg: NetworkArchitecture) {
		if (cfg.neuronsByLayer.length < 2) {
			throw new AppError(
				"neuronsByLayer must contain at least 2 entries (input + output).",
				ErrorCodes.AGENT_ERROR
			);
		}

		this._enablePool = cfg.enablePool ?? true;
		this._poolMaxSize = cfg.poolMaxSize ?? 10_000;
		this._nn = new NeuralNetwork(cfg as NeuralNetworkConfig);
	}

	/**
	 * Appends a numeric score to the agent's history.
	 * Useful for fitness tracking in evolutionary / reinforcement setups.
	 *
	 * @param score - The score to record (reward, accuracy, etc.).
	 */
	public addScore(score: number): void {
		this._scores.push(score);
	}

	/**
	 * Returns the arithmetic mean of all recorded scores, or `0` if none exist.
	 */
	public getAverageScore(): number {
		if (this._scores.length === 0) {
			return 0;
		}
		let sum = 0;
		for (let i = 0; i < this._scores.length; i++) {
			sum += this._scores[i];
		}
		return sum / this._scores.length;
	}

	/**
	 * Returns the cumulative sum of all recorded scores.
	 */
	public getTotalScore(): number {
		let sum = 0;
		for (let i = 0; i < this._scores.length; i++) {
			sum += this._scores[i];
		}
		return sum;
	}

	/**
	 * Resets the score history.
	 */
	public resetScores(): void {
		this._scores = [];
	}

	/**
	 * Runs one forward pass and, when the pool is enabled, pushes the resulting
	 * {@link Experience} into the replay buffer (FIFO eviction past `poolMaxSize`).
	 *
	 * Always call this method during environment interaction instead of
	 * `nn.forward()` directly so the pool stays in sync.
	 *
	 * @param input     - Raw input vector (length must equal `neuronsByLayer[0]`).
	 * @param reward    - Immediate reward received after the action (Q-learning).
	 * @param nextState - Next observation (Q-learning).
	 * @param done      - Whether the episode terminated after this step.
	 * @returns Network output vector.
	 */
	public fastForward(
		input: Float32Array,
		reward?: number,
		nextState?: Float32Array,
		done?: boolean
	): Float32Array {
		const { output } = this._nn.forward(input);

		if (this._enablePool) {
			const id = this._nextPoolId++;
			const exp: Experience =
				reward !== undefined && nextState !== undefined
					? {
							kind: "qlearning",
							input,
							output: output.slice(),
							reward,
							nextState,
							done: done ?? false,
						}
					: { kind: "bare", input, output: output.slice() };
			this._poolMap.set(id, exp);
			this._poolInputToId.set(input, id);
			if (this._poolMap.size > this._poolMaxSize) {
				const firstKey = this._poolMap.keys().next().value!;
				const oldest = this._poolMap.get(firstKey);
				this._poolMap.delete(firstKey);
				this._poolInputToId.delete(oldest!.input);
			}
		}

		return output;
	}

	/**
	 * Returns a **copy** of the entire experience pool.
	 * The pool is empty when `enablePool` was set to `false` at construction.
	 */
	public getPool(): Experience[] {
		return [...this._poolMap.values()];
	}

	/**
	 * Returns the current number of experiences stored in the pool.
	 */
	public getPoolSize(): number {
		return this._poolMap.size;
	}

	/**
	 * Clears the experience pool.
	 * Call this after a backpropagation pass so stale experiences are not
	 * reused in the next episode.
	 */
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
		this._poolMap.clear();
		this._poolInputToId = new WeakMap();
	}

	/**
	 * Returns a random mini-batch sampled **without replacement** from the pool.
	 * Useful for experience replay in DQN-style training.
	 *
	 * @param batchSize - Number of experiences to sample.
	 * @returns An array of randomly selected {@link Experience} objects.
	 * @throws {AgentError} If the pool contains fewer experiences than requested.
	 */
	public samplePool(batchSize: number): Experience[] {
		const entries = [...this._poolMap.values()];
		if (batchSize > entries.length) {
			throw new AppError(
				`Requested batch size ${batchSize} exceeds pool size ${entries.length}.`,
				ErrorCodes.AGENT_ERROR
			);
		}

		for (let i = entries.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[entries[i], entries[j]] = [entries[j], entries[i]];
		}
		return entries.slice(0, batchSize);
	}

	/**
	 * Performs a **supervised backpropagation** step on a single sample.
	 * The experience pool entry matching this input/target pair is removed
	 * afterwards so it is not counted twice.
	 *
	 * @param input - Input vector.
	 * @param target - Ground-truth output vector.
	 */
	public learnSupervised(input: Float32Array, target: Float32Array): void {
		this._nn.train(input, target);
		this._removeFromPool(input);
	}

	/**
	 * Performs a **batch supervised backpropagation** pass over every experience
	 * in the pool that has a `target` field set, then clears the pool.
	 *
	 * Typical usage for classic deep learning:
	 * 1. Collect many steps via {@link fastForward}.
	 * 2. Attach targets externally (or use experiences that were created with a
	 *    target from the start).
	 * 3. Call `learnFromPool()`.
	 */
	public learnFromPool(): void {
		for (const exp of this._poolMap.values()) {
			if (exp.kind === "supervised") {
				this._nn.train(exp.input, exp.target);
			}
		}
		this.clearPool();
	}

	/**
	 * Applies a single **Q-learning (Bellman) update** for one experience tuple.
	 *
	 * Only the Q-value of the greedy action taken is updated; all other output
	 * neurons keep their current values as targets (no spurious gradient on
	 * unvisited actions).
	 *
	 * ```
	 * target[a] = r + γ · max_a' Q(s', a')   (non-terminal)
	 * target[a] = r                            (terminal)
	 * ```
	 *
	 * @param exp   - Experience with `reward` and `nextState` set.
	 * @param gamma - Discount factor. @default 0.99
	 * @throws {AgentError} When `reward` or `nextState` is missing.
	 */
	public learnQLearning(exp: Experience, gamma = 0.99): void {
		if (exp.kind !== "qlearning") {
			throw new AppError(
				"Q-learning requires `reward` and `nextState` in the experience.",
				ErrorCodes.AGENT_ERROR
			);
		}

		const target = exp.output.slice(); // Q(s, a) for all actions
		const nextQ = this._nn.forward(exp.nextState).output; // Q(s', a') — no pool entry
		const maxNextQ = exp.done ? 0 : Math.max(...nextQ);
		const actionIdx = target.indexOf(Math.max(...target)); // greedy action taken

		target[actionIdx] = exp.reward + gamma * maxNextQ;

		this._nn.train(exp.input, target);
		this._removeFromPool(exp.input);
	}

	/**
	 * Removes the first pool entry whose `input` array matches the provided
	 * vector element-by-element.  Called after a training step to avoid double
	 * counting the same experience.
	 *
	 * @internal
	 */
	private _removeFromPool(input: Float32Array): void {
		const id = this._poolInputToId.get(input);
		if (id !== undefined) {
			this._poolMap.delete(id);
			this._poolInputToId.delete(input);
		}
	}
}
