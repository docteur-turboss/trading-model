/**
 * EvaluationPipeline: Orchestrates RL training and evaluation phases.
 * Handles reward shaping, n-step returns, shadow backends, and Lamarckian updates.
 */

import type { LamarckGenome, MarketStep } from "./genome_types";
import type { Experience } from "core/neural_network/type";

// RLBackend is defined in ga_runner.ts and exported from there
// We avoid circular dependency by using a type-only reference
export interface RLBackend {
  forwardPass(features: Float32Array): Float32Array;
  step(features: Float32Array, price: number): { reward: number };
  train(experience: Experience, gamma: number): void;
  getWeights(): Float32Array;
  setWeights(w: Float32Array): void;
  getPnL(): number;
  resetEpisode(): void;
  getExperiencePool(): Experience[];
}
import { estimateComplexity, computeAdjustedFitness } from "./complexity_estimator";

export type BackendFactory = (g: DeepReadonly<LamarckGenome>) => RLBackend;

type GenomeFitnessMeta = {
  episodesRun:     number;
  computeMs:       number;
  efficiencyScore: number;
  variance:        number;
  rawScores:       number[];
};

/**
 * Running statistics using Welford's online algorithm.
 */
class RunningStats {
  private n = 0;
  private mean = 0;
  private M2   = 0;

  update(x: number): void {
    this.n++;
    const delta = x - this.mean;
    this.mean += delta / this.n;
    this.M2 += delta * (x - this.mean);
  }

  get std() { return this.n < 2 ? 1 : Math.sqrt(this.M2 / (this.n - 1)); }
  get mu()  { return this.mean; }
  normalize(x: number) { return (x - this.mu) / (this.std + 1e-8); }
}

/**
 * Apply reward shaping (normalize, sparse mode, etc).
 */
function shapeReward(raw: number, config: DeepReadonly<LamarckGenome["rl"]["rewardShaping"]>): number {
  let shaped = raw;
  if (config.clipRange) {
    shaped = Math.max(-config.clipRange, Math.min(config.clipRange, shaped));
  }
  return shaped;
}

/**
 * Precompute rewards for all market steps using a shadow backend.
 * WARNING: mutates the shadow backend (wallet, pool). Always pass a fresh one.
 */
function precomputeRewards(
  backend: RLBackend,
  data: MarketStep[],
  g: DeepReadonly<LamarckGenome>,
  runStats?: RunningStats,
): Float32Array {
  const rShape = g.rl.rewardShaping;
  const buf    = new Float32Array(data.length);
  for (let t = 0; t < data.length; t++) {
    const { reward } = backend.step(data[t].features, data[t].price);
    let shaped = shapeReward(reward, rShape);
    if (rShape.normalize) { runStats?.update(shaped); shaped = runStats?.normalize(shaped) ?? shaped; }
    buf[t] = shaped;
  }
  return buf;
}

/**
 * Compute n-step discounted return from reward buffer.
 */
function nStepReturn(buf: Float32Array, t: number, g: DeepReadonly<LamarckGenome>): number {
  let ret = 0;
  const n = g.rl.horizon.nStepReturn;
  for (let i = 0; i < n && t + i < buf.length; i++) {
    ret += Math.pow(g.rl.gamma, i) * buf[t + i];
  }
  return ret;
}

/**
 * Train phase: backend learns from pre-computed reward buffer.
 * rewardBuf MUST have been computed by a shadow backend beforehand.
 */
async function trainPhase(
  backend: RLBackend,
  trainData: MarketStep[],
  rewardBuf: Float32Array,
  g: DeepReadonly<LamarckGenome>,
): Promise<void> {
  const horizon = g.rl.horizon;
  const maxT    = Math.min(trainData.length, horizon.maxEpisodeLength);
 
  for (let t = 0; t < maxT; t++) {
    if (t % horizon.frameSkip !== 0) continue;
 
    // step() already does inference + action + wallet update internally
    backend.step(trainData[t].features, trainData[t].price);
 
    const pool = backend.getExperiencePool();
    if (pool.length >= 2) {
      const prev = pool[pool.length - 2];
      backend.train({
        ...prev,
        reward:    nStepReturn(rewardBuf, t, g),
        nextState: trainData[t].features,
        done:      t === maxT - 1,
      }, g.rl.gamma);
    }
  }
}

/**
 * Eval phase: evaluate genome on held-out validation data.
 * Does NOT update weights; only accumulates PnL.
 */
async function evalPhase(
  g: DeepReadonly<LamarckGenome>,
  validationData: MarketStep[],
  backendFactory: BackendFactory,
): Promise<{ rawScores: number[]; finalPnL: number }> {
  const ctrl    = g.gaControl;
  const rShape  = g.rl.rewardShaping;
  const horizon = g.rl.horizon;
  const rawScores: number[] = [];
 
  for (let ep = 0; ep < ctrl.episodesPerIndividual; ep++) {
    const backend  = backendFactory(g);  // fresh backend with Lamarckian weights
    const runStats = new RunningStats();
    let epReward   = 0;
 
    const maxT = Math.min(validationData.length, horizon.maxEpisodeLength);
 
    for (let t = 0; t < maxT; t++) {
      if (t % horizon.frameSkip !== 0) continue;
 
      // step() handles everything — no forwardPass() call before it
      const { reward } = backend.step(validationData[t].features, validationData[t].price);
 
      let shaped = shapeReward(reward, rShape);
      if (rShape.normalize) { runStats?.update(shaped); shaped = runStats?.normalize(shaped) ?? shaped; }
      if (!rShape.sparse) epReward += shaped;
    }
 
    if (rShape.sparse) epReward = backend.getPnL();
    rawScores.push(epReward);
    backend.resetEpisode();
  }
 
  return {
    rawScores,
    finalPnL: rawScores.reduce((s, v) => s + v, 0) / rawScores.length,
  };
}

/**
 * Extract trained weights from backend and attach to genome.
 * Returns a new deep-frozen genome; original untouched.
 */
function lamarckianUpdate(
  g: DeepReadonly<LamarckGenome>,
  backend: RLBackend,
): DeepReadonly<LamarckGenome> {
  const snapshot = backend.getWeights().slice();
  return {
    ...g,
    trainedWeights: snapshot,
  } as DeepReadonly<LamarckGenome>;
}

function deepFreeze<T>(obj: T): DeepReadonly<T> {
  if (obj === null || typeof obj !== "object") return obj as DeepReadonly<T>;
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return Object.freeze(obj) as DeepReadonly<T>;
}

function computeVariance(scores: number[]): number {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  return scores.reduce((s, v) => s + (v - mean) ** 2, 0) / (scores.length - 1);
}

function computeSharpe(scores: number[]): number {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const std  = Math.sqrt(computeVariance(scores));
  return std < 1e-8 ? 0 : mean / std;
}

function computeFitness(fitnessType: string, scores: number[]): number {
  // Placeholder: implement based on your fitnessType logic
  return scores.reduce((s, v) => s + v, 0) / scores.length;
}

/**
 * Evaluate a single genome across all window sets:
 * - Train phase on each window's training data
 * - Eval phase on each window's validation data
 * - Lamarckian weight persistence across windows
 * - Returns updated genome + fitness meta + objectives
 */
export async function evaluateGenomeAllWindows(
  g: DeepReadonly<LamarckGenome>,
  windowSets: Array<{ id: string; train: MarketStep[]; validation: MarketStep[] }>,
  backendFactory: BackendFactory,
): Promise<{
  updatedGenome: DeepReadonly<LamarckGenome>;
  meta:          GenomeFitnessMeta;
  objectives:    { avgPnl: number; sharpe: number; negFlops: number };
}> {
  const t0 = Date.now();
  const allRaw: number[] = [];
  const allPnL: number[] = [];

  let currentGenome = g;

  for (const ws of windowSets) {
    // shadow backend pre-computes reward buffer without touching trainBackend
    const shadowBackend = backendFactory(currentGenome);
    const shadowStats   = new RunningStats();
    const rewardBuf     = precomputeRewards(shadowBackend, ws.train, currentGenome, shadowStats);
    // shadowBackend state is now polluted; it is discarded here
 
    // live training backend receives the pre-computed buffer
    const trainBackend = backendFactory(currentGenome);
    await trainPhase(trainBackend, ws.train, rewardBuf, currentGenome);
 
    // Lamarckian: freeze trained weights into genome before eval
    currentGenome = deepFreeze(lamarckianUpdate(currentGenome, trainBackend));

    // Evaluate on held-out validation only
    const evalResult = await evalPhase(currentGenome, ws.validation, backendFactory);
    allRaw.push(...evalResult.rawScores);
    allPnL.push(evalResult.finalPnL);
  }

  const complexity = estimateComplexity(currentGenome);
  const LAMBDA     = 0.15;
  const fitness    = computeFitness(g.gaControl.fitnessType, allRaw);
  const adjFitness = computeAdjustedFitness(fitness, complexity, LAMBDA);
 
  const avgPnL   = allPnL.reduce((s, v) => s + v, 0) / allPnL.length;
  const sharpe   = computeSharpe(allRaw);
  const negFlops = -complexity.inferenceFLOPs;
 
  return {
    updatedGenome: currentGenome,
    meta: {
      episodesRun:     allRaw.length,
      computeMs:       Date.now() - t0,
      efficiencyScore: adjFitness,
      variance:        computeVariance(allRaw),
      rawScores:       allRaw,
    },
    objectives: { avgPnL, sharpe, negFlops },
  };
}

/**
 * Parallel evaluation with bounded concurrency.
 */
export async function pooledEval<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
 
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }
 
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
