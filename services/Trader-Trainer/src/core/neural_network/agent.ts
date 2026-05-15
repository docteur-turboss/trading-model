import { NeuralNetwork } from "./neural-network";
import { AgentError } from "cash-lib/utils/Errors";
import { Experience, NeuralNetworkConfig } from "./type";
 
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
  /** Underlying neural network — exposed as `readonly` for direct access. */
  public readonly nn: NeuralNetwork;

  /** Accumulated scores added via {@link addScore}. */
  private scores: Float32Array = new Float32Array();

  /** Experiences collected by {@link fastForward}. */
  private pool: Experience[] = [];

  /** Maximum number of experiences kept in the pool (FIFO). */
  private readonly poolMaxSize: number;

  /** Whether the pool is active. */
  private readonly enablePool: boolean;

  /**
   * @param cfg - Full network configuration forwarded to {@link NeuralNetwork}.
   *   `enablePool` and `poolMaxSize` are consumed by the agent layer;
   *   everything else is forwarded verbatim.
   */
  constructor(private readonly cfg: NeuralNetworkConfig) {
    if (cfg.neuronsByLayer.length < 2) 
      throw new AgentError("neuronsByLayer must contain at least 2 entries (input + output).");

    this.enablePool  = cfg.enablePool  ?? true;
    this.poolMaxSize = cfg.poolMaxSize ?? 10_000;
    this.nn = new NeuralNetwork(cfg);
  }

  /**
   * Appends a numeric score to the agent's history.
   * Useful for fitness tracking in evolutionary / reinforcement setups.
   *
   * @param score - The score to record (reward, accuracy, etc.).
   */
  public addScore(score: number): void {
    this.scores = new Float32Array(this.scores.length + 1);
    this.scores.set([...this.scores, score])
  }

  /**
   * Returns the arithmetic mean of all recorded scores, or `0` if none exist.
   */
  public getAverageScore(): number {
    if (this.scores.length === 0) return 0;
    return this.scores.reduce((s, v) => s + v, 0) / this.scores.length;
  }

  /**
   * Returns the cumulative sum of all recorded scores.
   */
  public getTotalScore(): number {
    return this.scores.reduce((s, v) => s + v, 0);
  }

  /**
   * Resets the score history.
   */
  public resetScores(): void {
    this.scores = new Float32Array();
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
    done?: boolean,
  ): Float32Array {
    const {output} = this.nn.forward(input);

    if (this.enablePool) {
      this.pool.push({ input, output: output.slice(), reward, nextState, done });
      // FIFO eviction
      if (this.pool.length > this.poolMaxSize) this.pool.shift();
    }

    return output;
  }

  /**
   * Returns a **copy** of the entire experience pool.
   * The pool is empty when `enablePool` was set to `false` at construction.
   */
  public getPool(): Experience[] {
    return [...this.pool];
  }

  /**
   * Returns the current number of experiences stored in the pool.
   */
  public getPoolSize(): number {
    return this.pool.length;
  }

  /**
   * Clears the experience pool.
   * Call this after a backpropagation pass so stale experiences are not
   * reused in the next episode.
   */
  public clearPool(): void {
    this.pool = [];
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
    if (batchSize > this.pool.length)
      throw new AgentError(
        `Requested batch size ${batchSize} exceeds pool size ${this.pool.length}.`,
      );

    const shuffled = [...this.pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, batchSize);
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
    this.nn.train(input, target);
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
    for (const exp of this.pool) {
      if (exp.target) this.nn.train(exp.input, exp.target);
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
  public learnQLearning(exp: Experience, gamma: number = 0.99): void {
    if (exp.reward === undefined || !exp.nextState)
      throw new AgentError("Q-learning requires `reward` and `nextState` in the experience.");

    const target    = exp.output.slice(); // Q(s, a) for all actions
    const nextQ     = this.nn.forward(exp.nextState).output; // Q(s', a') — no pool entry
    const maxNextQ  = exp.done ? 0 : Math.max(...nextQ);
    const actionIdx = target.indexOf(Math.max(...target)); // greedy action taken

    target[actionIdx] = exp.reward + gamma * maxNextQ;

    this.nn.train(exp.input, target);
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
    const idx = this.pool.findIndex(
      (e) => e.input.length === input.length && e.input.every((v, i) => v === input[i]),
    );
    if (idx !== -1) this.pool.splice(idx, 1);
  }
}