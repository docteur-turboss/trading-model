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
    const partialInput = this._applyPartialNormalization(input);
    const output = this.nn.forward(partialInput);

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
    const nextQ     = this.nn.forward(exp.nextState); // Q(s', a') — no pool entry
    const maxNextQ  = exp.done ? 0 : Math.max(...nextQ);
    const actionIdx = target.indexOf(Math.max(...target)); // greedy action taken

    target[actionIdx] = exp.reward + gamma * maxNextQ;

    this.nn.train(exp.input, target);
    this._removeFromPool(exp.input);
  }

  /**
   * Applies partial normalisation: only the slice
   * `[normalizedInputRange[0], normalizedInputRange[1]]` of the input vector
   * is passed through the network's normalisation pipeline; the rest is
   * forwarded as-is.
   *
   * Because `NeuralNetwork.normalize` is private we replicate the logic here
   * so that the agent can selectively normalise sub-ranges without requiring
   * changes to the base class.
   *
   * @internal
   */
  private _applyPartialNormalization(input: Float32Array): Float32Array {
    if (this.cfg.normalisationType === "none") return input;

    const [start, end] = this.cfg.normalizedInputRange!;
    const slice = input.slice(start, end + 1);
    const normalized = this._normalize(slice);

    return new Float32Array([
      ...input.slice(0, start),
      ...normalized,
      ...input.slice(end + 1),
    ]);
  }

  /**
   * Normalises an array of numbers using the strategy declared in the config.
   * Mirrors `NeuralNetwork.normalize` so that partial normalisation is
   * consistent with what the underlying network would apply to the full input.
   *
   * @internal
   */
  private _normalize(input: Float32Array, params?: {min: number, max: number}): Float32Array {
    const data = new Float32Array(input);
    const len = data.length;

    if (len === 0) return data;

    switch (this.cfg.normalisationType) {
      case "min-max": {
        let min = data[0];
        let max = data[0];

        for (const x of data) { if (x < min) min = x; if (x > max) max = x; };

        const range = (1 / (max - min)) || 1;

        for (let i = 0; i < len; i++) data[i] = (data[i] - min) * range;

        return data
      }

      case "z-score": {
        let sum = 0;
        for (let x of data) sum += x;

        const mean = sum / len;

        let variance = 0;

        for (let x of data) variance += (x - mean) ** 2;
        const invStd = 1 / (Math.sqrt(variance / len) || 1);

        for (let i = 0; i < len; i++) data[i] = (data[i] - mean) * invStd;
        
        return data;
      }

      case "decimal-scaling": {
        let maxAbs = 0;

        for (let x of data) {
          const abs = Math.abs(x);
          if (abs > maxAbs) maxAbs = abs;
        }

        const j = Math.ceil(Math.log10(maxAbs + 1));
        const denom = Math.pow(10, j);

        for (let i = 0; i < len; i++) {
          data[i] = data[i] / denom;
        }

        return data;
      }

      case "border": {
        let lo = params?.min;
        let hi = params?.max;

        if (lo === undefined || hi === undefined) {
          let min = data[0];
          let max = data[0];

          for (const x of data) { if (x < min) min = x; if (x > max) max = x; }

          if (lo === undefined) lo = min;
          if (hi === undefined) hi = max;
        }

        for(let i = 0; i < len; i++) {
          const x = data[i];

          data[i] =
            x < lo ? lo :
            x > hi ? hi :
            x;
        }

        return data;
      }

      case "robust-scaling": {
        const sorted = new Float32Array(data);
        sorted.sort();

        const n = len;
        
        const q1i = (n * 0.25) | 0;
        const q3i = (n * 0.75) | 0;

        const median =
          n & 1
            ? sorted[n >> 1]
            : (sorted[(n >> 1) - 1] + sorted[n >> 1]) * 0.5;

        const q1 = sorted[q1i];
        const q3 = sorted[q3i];

        const invIqr = 1 / (q3 - q1 || 1);

        for (let i = 0; i < len; ++i) {
          data[i] = (data[i] - median) * invIqr;
        }

        return data;
      }

      case "logarithmic-normalization":
        for (let i = 0; i < len; ++i) {
          const x = data[i];

          data[i] =
            x < 0
              ? -Math.log(1 - x)
              : Math.log(1 + x);
        }

        return data;
      default:
        return data;
    }
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