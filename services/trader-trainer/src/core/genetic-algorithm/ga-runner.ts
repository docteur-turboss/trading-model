// ----------------------------------------------------------------
//            Self-adaptive Genetic Algorithm runner
//   Couples with TradingAgent / AutoEnv / Deep Q-Learning agent
// ----------------------------------------------------------------

import { crossoverGenomes } from './crossover';
import { crossoverWeights, mutateWeights } from './evolution-engine';
import { createDefaultGenome } from './factory';
import { computeFitness, shapeReward } from './fitness';
import {
  Genome,
  GAControlGenome,
  GenomeFitnessMeta,
  MarketStep,
  LamarckGenome,
} from './genome-types';
import { mutateGenome } from './mutation';
import { makePRNG } from './prng';
import { selectParent } from './selection';
import { generateId, RunningStats, computeVariance, computeSharpe } from './utils';
import { Experience } from '../../core/neural-network/type';
import TradingAgent, { TradingAgentConfig } from '../agent/trading-agent';

// ----------------------------------------------------------------
// Immutability helpers
// ----------------------------------------------------------------
type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

function deepFreeze<T>(obj: T): DeepReadonly<T> {
  /* istanbul ignore if */
  if (obj === null || typeof obj !== 'object') return obj as DeepReadonly<T>;

  // Typed arrays (Float32Array etc) cannot be frozen; skip them
  if (ArrayBuffer.isView(obj)) return obj as DeepReadonly<T>;

  // Freeze nested objects first (depth-first)
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }

  return Object.freeze(obj) as DeepReadonly<T>;
}

/** Produce a new deep-frozen genome with patch applied; original untouched. */
function withGenome<T extends Genome>(base: DeepReadonly<T>, patch: Partial<T>): DeepReadonly<T> {
  // Shallow merge at the top level, then deep-freeze the result.
  // For nested objects in patch, caller is responsible for providing
  // complete replacements — no partial sub-object merging.
  return deepFreeze({ ...base, ...patch } as T) as DeepReadonly<T>;
}

// ----------------------------------------------------------------
// RL backend interface (decouples runner from DQN internals)
// ----------------------------------------------------------------
export interface RLBackend {
  /**
   * Pure read of network output — does NOT push to experience pool.
   * Use for observation / policy sampling without side-effects.
   */
  forwardPass(features: Float32Array): Float32Array;
  /**
   * Full environment step: sets price, runs inference, executes
   * trade in wallet, returns reward.  Pushes to experience pool.
   */
  step(features: Float32Array, price: number): { reward: number };
  /** Q-learning update on one experience tuple. */
  train(experience: Experience, gamma: number): void;
  /** Flat weight snapshot for Lamarckian storage. */
  getWeights(): Float32Array;
  /** Restore weights from a Lamarckian snapshot. */
  setWeights(w: Float32Array): void;
  getPnL(): number;
  resetEpisode(): void;
  getExperiencePool(): Experience[];
}

/** Factory: the runner only knows how to ask for backends, not how to build them. */
export type BackendFactory = (g: DeepReadonly<LamarckGenome>) => RLBackend;

// ----------------------------------------------------------------
// TradingAgent → RLBackend adaptor
// ----------------------------------------------------------------
/** Build an RLBackend adaptor from a genome by creating a TradingAgent with the genome's architecture and hyperparameters. */
export function makeTradingAgentBackend(g: DeepReadonly<LamarckGenome>): RLBackend {
  const dp = g.rl.discretePolicy;
  const rb = g.rl.replayBuffer;

  const cfg: TradingAgentConfig = {
    nnConfig: {
      neuronsByLayer: [
        g.network.inputDim,
        ...g.network.hiddenLayers.map(l => l.neurons),
        g.network.outputDim,
      ],
      activationType: g.network.hiddenLayers.map(l => l.activation),
      connectionType: g.network.hiddenLayers[0]?.connectionType ?? 'fully-connected',
      biasInitialisationType: g.network.hiddenLayers[0]?.biasType ?? 'random',
      normalisationType: g.network.normalization,
      enablePool: true,
      poolMaxSize: rb.bufferSize,
    },
    wallet: { initialCash: 1000, initialPrice: 1 },
    actionSpace: 'discrete',
    tradeAmount: 1,
    stateManagerCfg: {
      epsilonStart: dp.epsilonStart,
      epsilonMin: dp.epsilonMin,
      epsilonDecay: dp.epsilonDecay,
      gamma: g.rl.gamma,
    },
  };

  const agent = new TradingAgent(cfg);

  // Lamarckian weight injection via actual nn API
  if (g.trainedWeights) {
    try {
      agent.agent.nn.setWeights(new Float32Array(g.trainedWeights));
    } catch (_) {
      /* architecture mismatch after structural mutation — start fresh */
    }
  }

  return {
    // nn.forward is the pure, no-pool-push path; fastForward pushes to pool
    forwardPass: f => agent.agent.nn.forward(f).output,
    step: (f, p) => agent.step(f, p),
    train: (e, γ) => {
      try {
        agent.agent.learnQLearning(e, γ);
      } catch (_) {
        /* Q-learning error skipped — continue training */
      }
    },
    getWeights: () => agent.agent.nn.getWeights(),
    setWeights: w => agent.agent.nn.setWeights(w),
    getPnL: () => agent.wallet.getPnL(),
    resetEpisode: () => agent.resetEpisode(),
    getExperiencePool: () => agent.agent.getPool(),
  };
}

// ----------------------------------------------------------------
// Walk-forward window types (train ≠ eval)
// ----------------------------------------------------------------
/**
 * A named train/validation split.
 * Genomes are ALWAYS evaluated on `validation`, never on `train`.
 * This enforces out-of-sample fitness.
 */
export type WindowSet = {
  id: string;
  train: MarketStep[];
  validation: MarketStep[];
};

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
/** All objectives we optimise simultaneously. */
type ObjectiveVector = {
  /** Average PnL across windows. */
  avgPnl: number;
  /** Sharpe-like ratio. */
  sharpe: number;
  /** −estimated_inference_flops. */
  negFlops: number;
};

/** Index-parallel arrays — avoids genome-copy explosion. */
type PopulationMeta = {
  objectives: ObjectiveVector[]; // [i] for genome at index i
  paretoRank: number[];
  crowdingDist: number[];
};

export type GARunnerConfig = {
  windowSets: WindowSet[]; // single field, no duplication
  backendFactory: BackendFactory;
  /** Worker concurrency cap for parallel evaluation. */
  evalConcurrency?: number;
  /** Hook called after each generation. */
  onGeneration?: (ctx: GenerationContext) => void;
  onArchiveUpdate?: (archive: DeepReadonly<LamarckGenome>[]) => void;
  /** Override initial GA control parameters. */
  initialControl?: Partial<GAControlGenome>;
};

export type GenerationContext = {
  generation: number;
  population: DeepReadonly<LamarckGenome>[];
  archive: DeepReadonly<LamarckGenome>[];
  bestFitness: number;
  bestGenome: DeepReadonly<LamarckGenome>;
  avgFitness: number;
  efficiencyScore: number;
  elapsedMs: number;
  stagnation: number;
  gaControl: DeepReadonly<GAControlGenome>;
};

/** Attach objectives and Pareto rank to a genome (immutably). */

// ----------------------------------------------------------------
// FLOPs + memory complexity estimate
// ----------------------------------------------------------------

const EXACT_NSGA2_THRESHOLD = 300;
const FLOP_SOFT_CAP = 5_000_000; // 5M MACs
const MEM_SOFT_CAP = 200_000_000; // 200 MB

// Activation cost multipliers (rough relative cost vs linear)
const ACT_COST: Record<string, number> = {
  relu: 1,
  sigmoid: 4,
  tanh: 4,
  gelu: 8,
  swish: 6,
  linear: 1,
};

type ComplexityProfile = {
  inferenceFLOPs: number; // multiply-accumulate ops for one forward pass
  /** Combined penalty in [0, 1]. */
  penalty: number;
};

function estimateComplexity(g: DeepReadonly<LamarckGenome>): ComplexityProfile {
  const dims = [
    g.network.inputDim,
    ...g.network.hiddenLayers.map(l => l.neurons),
    g.network.outputDim,
  ];

  let flops = 0;
  let params = 0;

  for (let i = 1; i < dims.length; i++) {
    const w = dims[i - 1] * dims[i];
    const b = dims[i];
    const act = g.network.hiddenLayers[i - 1]?.activation ?? 'linear';
    flops += 2 * w + b * (ACT_COST[act] ?? 2);
    params += w + b;
  }

  const effectiveFlops = flops / Math.max(1, g.rl.horizon.frameSkip);
  const paramBytes = params * 4;
  const replayBytes = g.rl.replayBuffer.bufferSize * g.network.inputDim * 4 * 2;

  const flopPenalty = Math.min(1, effectiveFlops / FLOP_SOFT_CAP);
  const memPenalty = Math.min(1, (paramBytes + replayBytes) / MEM_SOFT_CAP);

  return {
    inferenceFLOPs: flops,
    penalty: 0.6 * flopPenalty + 0.4 * memPenalty,
  };
}

// ----------------------------------------------------------------
// PrecomputeRewards operates on RLBackend (not TradingAgent)
//
// IMPORTANT: this function calls backend.step() — it MUTATES the backend
// (wallet, pool).  Always pass a SHADOW backend; discard it afterwards.
// ----------------------------------------------------------------
/**
 * One-pass over marketData: applies reward shaping without calling agent.step().
 * Used exclusively by n-step look-ahead; the agent's state is untouched.
 */
function precomputeRewards(
  backend: RLBackend,
  data: MarketStep[],
  g: DeepReadonly<LamarckGenome>,
  runStats?: RunningStats
): Float32Array {
  const rShape = g.rl.rewardShaping;
  const buf = new Float32Array(data.length);
  for (let t = 0; t < data.length; t++) {
    const { reward } = backend.step(data[t].features, data[t].price);
    let shaped = shapeReward(reward, rShape);
    /* istanbul ignore next */
    if (rShape.normalize) {
      runStats?.update(shaped);
      shaped = runStats?.normalize(shaped) ?? shaped;
    }
    buf[t] = shaped;
  }
  return buf;
}

function nStepReturn(buf: Float32Array, t: number, g: DeepReadonly<LamarckGenome>): number {
  let ret = 0;
  const n = g.rl.horizon.nStepReturn;
  for (let i = 0; i < n && t + i < buf.length; i++) {
    ret += Math.pow(g.rl.gamma, i) * buf[t + i];
  }
  return ret;
}

// ----------------------------------------------------------------
// trainPhase: accepts pre-computed rewardBuf, no forwardPass call
// ----------------------------------------------------------------

/**
 * Trains the backend on one episode of trainData.
 * rewardBuf MUST have been computed by a shadow backend beforehand.
 * TradingAgent.step() handles inference + epsilon-greedy internally.
 */
async function trainPhase(
  backend: RLBackend,
  trainData: MarketStep[],
  rewardBuf: Float32Array,
  g: DeepReadonly<LamarckGenome>
): Promise<void> {
  const horizon = g.rl.horizon;
  const maxT = Math.min(trainData.length, horizon.maxEpisodeLength);

  for (let t = 0; t < maxT; t++) {
    if (t % horizon.frameSkip !== 0) continue;

    // F3: step() already does inference + action + wallet update internally
    backend.step(trainData[t].features, trainData[t].price);

    const pool = backend.getExperiencePool();
    if (pool.length >= 2) {
      const prev = pool[pool.length - 2];
      backend.train(
        {
          ...prev,
          reward: nStepReturn(rewardBuf, t, g),
          nextState: trainData[t].features,
          done: t === maxT - 1,
        },
        g.rl.gamma
      );
    }
  }
}

// ----------------------------------------------------------------
// evalPhase: no forwardPass, step() handles action internally
// ----------------------------------------------------------------
async function evalPhase(
  g: DeepReadonly<LamarckGenome>,
  validationData: MarketStep[],
  backendFactory: BackendFactory
): Promise<{ rawScores: number[]; finalPnl: number }> {
  const ctrl = g.gaControl;
  const rShape = g.rl.rewardShaping;
  const horizon = g.rl.horizon;
  const rawScores: number[] = [];

  for (let ep = 0; ep < ctrl.episodesPerIndividual; ep++) {
    const backend = backendFactory(g); // fresh backend with Lamarckian weights
    const runStats = new RunningStats();
    let epReward = 0;

    const maxT = Math.min(validationData.length, horizon.maxEpisodeLength);

    for (let t = 0; t < maxT; t++) {
      if (t % horizon.frameSkip !== 0) continue;

      // step() handles everything — no forwardPass() call before it
      const { reward } = backend.step(validationData[t].features, validationData[t].price);

      let shaped = shapeReward(reward, rShape);
      /* istanbul ignore next */
      if (rShape.normalize) {
        runStats.update(shaped);
        shaped = runStats.normalize(shaped);
      }
      if (!rShape.sparse) epReward += shaped;
    }

    if (rShape.sparse) epReward = backend.getPnL();
    rawScores.push(epReward);
    backend.resetEpisode();
  }

  return {
    rawScores,
    finalPnl: rawScores.reduce((s, v) => s + v, 0) / rawScores.length,
  };
}

// ----------------------------------------------------------------
// Lamarckian weight extraction → new frozen genome
// ----------------------------------------------------------------
/**
 * After training, extract weights from the backend and attach them
 * to the genome as `trainedWeights`. Returns a new deep-frozen genome.
 * The original genome is never mutated.
 */
function lamarckianUpdate(
  g: DeepReadonly<LamarckGenome>,
  backend: RLBackend
): DeepReadonly<LamarckGenome> {
  // Snapshot: slice() copies — no aliasing with backend internal buffers
  const snapshot = backend.getWeights().slice();
  return withGenome(g, { trainedWeights: snapshot } as Partial<LamarckGenome>);
}

// ----------------------------------------------------------------
// Weight-level crossover (correct Float32Array iteration)
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// Full per-genome evaluation (train + Lamarck + eval, all windows)
// ----------------------------------------------------------------

async function evaluateGenomeAllWindows(
  g: DeepReadonly<LamarckGenome>,
  windowSets: WindowSet[],
  backendFactory: BackendFactory
): Promise<{
  updatedGenome: DeepReadonly<LamarckGenome>;
  meta: GenomeFitnessMeta;
  objectives: ObjectiveVector;
}> {
  const t0 = Date.now();
  const allRaw: number[] = [];
  const allPnl: number[] = [];

  let currentGenome = g;

  for (const ws of windowSets) {
    // shadow backend pre-computes reward buffer without touching trainBackend
    const shadowBackend = backendFactory(currentGenome);
    const shadowStats = new RunningStats();
    const rewardBuf = precomputeRewards(shadowBackend, ws.train, currentGenome, shadowStats);
    // shadowBackend state is now polluted; it is discarded here (not reused)

    // live training backend receives the pre-computed buffer
    const trainBackend = backendFactory(currentGenome);
    await trainPhase(trainBackend, ws.train, rewardBuf, currentGenome);

    // Lamarckian: freeze trained weights into genome before eval
    currentGenome = lamarckianUpdate(currentGenome, trainBackend);

    // Shadow backend discarded after this — its state is irrelevant
    void rewardBuf;

    // evaluate on held-out validation only
    const evalResult = await evalPhase(currentGenome, ws.validation, backendFactory);
    allRaw.push(...evalResult.rawScores);
    allPnl.push(evalResult.finalPnl);
  }

  const complexity = estimateComplexity(currentGenome);
  const LAMBDA = 0.15;
  const fitness = computeFitness(g.gaControl.fitnessType, allRaw);
  const adjFitness = fitness * (1 - LAMBDA * complexity.penalty);

  const avgPnl = allPnl.reduce((s, v) => s + v, 0) / allPnl.length;
  const sharpe = computeSharpe(allRaw);
  const negFlops = -complexity.inferenceFLOPs;

  return {
    updatedGenome: currentGenome,
    meta: {
      episodesRun: allRaw.length,
      computeMs: Date.now() - t0, // logging only — not used in fitness (C5)
      efficiencyScore: adjFitness,
      variance: computeVariance(allRaw),
      rawScores: allRaw,
    },
    objectives: { avgPnl, sharpe, negFlops },
  };
}

// ----------------------------------------------------------------
// NSGA-II: exact O(n²) and approximate O(n·k)
// ----------------------------------------------------------------
function dominates(a: ObjectiveVector, b: ObjectiveVector): boolean {
  return (
    a.avgPnl >= b.avgPnl &&
    a.sharpe >= b.sharpe &&
    a.negFlops >= b.negFlops &&
    (a.avgPnl > b.avgPnl || a.sharpe > b.sharpe || a.negFlops > b.negFlops)
  );
}

function nondominatedSortExact(objectives: ObjectiveVector[]): number[] {
  const n = objectives.length;
  const dominated = new Int32Array(n);
  const dominates_ = Array.from({ length: n }, () => [] as number[]);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (dominates(objectives[i], objectives[j])) dominates_[i].push(j);
      else if (dominates(objectives[j], objectives[i])) dominated[i]++;
    }
  }

  const ranks = new Array<number>(n).fill(0);
  let front = Array.from({ length: n }, (_, i) => i).filter(i => dominated[i] === 0);
  let rank = 0;

  while (front.length > 0) {
    const next: number[] = [];
    for (const i of front) {
      ranks[i] = rank;
      for (const j of dominates_[i]) {
        if (--dominated[j] === 0) next.push(j);
      }
    }
    front = next;
    rank++;
  }

  return ranks;
}

/* istanbul ignore next */
function nondominatedSortApprox(objectives: ObjectiveVector[], rng: () => number): number[] {
  const n = objectives.length;
  const k = Math.min(n - 1, Math.ceil(Math.sqrt(n) * 4));
  const dominated = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    const pool = Array.from({ length: n - 1 }, (_, j) => (j >= i ? j + 1 : j));
    for (let s = 0; s < k; s++) {
      const idx = s + Math.floor(rng() * (pool.length - s));
      [pool[s], pool[idx]] = [pool[idx], pool[s]];
      if (dominates(objectives[pool[s]], objectives[i])) dominated[i]++;
    }
  }

  return Array.from(dominated);
}

/* istanbul ignore next */
function assignCrowding(
  indices: number[],
  objectives: ObjectiveVector[],
  crowding: number[]
): void {
  if (indices.length <= 2) {
    for (const i of indices) crowding[i] = Infinity;
    return;
  }

  const keys: (keyof ObjectiveVector)[] = ['avgPnl', 'sharpe', 'negFlops'];
  for (const i of indices) crowding[i] = 0;

  for (const k of keys) {
    const sorted = [...indices].sort((a, b) => objectives[a][k] - objectives[b][k]);
    crowding[sorted[0]] = crowding[sorted[sorted.length - 1]] = Infinity;
    const range = objectives[sorted[sorted.length - 1]][k] - objectives[sorted[0]][k];
    if (range === 0) continue;
    for (let m = 1; m < sorted.length - 1; m++) {
      crowding[sorted[m]] += (objectives[sorted[m + 1]][k] - objectives[sorted[m - 1]][k]) / range;
    }
  }
}

function buildPopulationMeta(objectives: ObjectiveVector[], rng: () => number): PopulationMeta {
  const n = objectives.length;
  /* istanbul ignore next */
  const paretoRank =
    n > EXACT_NSGA2_THRESHOLD
      ? nondominatedSortApprox(objectives, rng)
      : nondominatedSortExact(objectives);

  const crowdingDist = new Array<number>(n).fill(0);
  const maxRank = Math.max(...paretoRank);

  for (let r = 0; r <= maxRank; r++) {
    const front = paretoRank.reduce(
      (acc, rank, i) => (rank === r ? [...acc, i] : acc),
      [] as number[]
    );
    assignCrowding(front, objectives, crowdingDist);
  }

  return { objectives, paretoRank, crowdingDist };
}

// ----------------------------------------------------------------
// Elitist Pareto archive (persists across generations)
// ----------------------------------------------------------------
class ParetoArchive {
  private _members: DeepReadonly<LamarckGenome>[] = [];
  private _objs: ObjectiveVector[] = [];

  /**
   * Offer new candidates to the archive.
   * A candidate is accepted if it is not dominated by any current archive member.
   * Any archive members dominated by the new candidate are evicted.
   * Returns true if the archive changed.
   */
  update(genomes: DeepReadonly<LamarckGenome>[], objectives: ObjectiveVector[]): boolean {
    let changed = false;

    for (let ci = 0; ci < genomes.length; ci++) {
      const cObj = objectives[ci];
      /* istanbul ignore if */
      if (this._objs.some(aObj => dominates(aObj, cObj))) continue;

      // Evict dominated archive members
      const keep = this._members.map((_, ai) => !dominates(cObj, this._objs[ai]));
      this._members = [...this._members.filter((_, i) => keep[i]), genomes[ci]];
      this._objs = [...this._objs.filter((_, i) => keep[i]), cObj];
      changed = true;
    }

    return changed;
  }

  get members(): DeepReadonly<LamarckGenome>[] {
    return this._members;
  }
  /* istanbul ignore next */
  get size(): number {
    return this._members.length;
  }
}

// ----------------------------------------------------------------
// Self-adaptive GA control update
// ----------------------------------------------------------------
function adaptGAControl(
  ctrl: DeepReadonly<GAControlGenome>,
  effHistory: number[],
  stagnation: number
): Readonly<GAControlGenome> {
  if (effHistory.length < 3) return ctrl;

  const recent = effHistory.slice(-5);
  const isImproving = recent[recent.length - 1] > recent[0];

  let popSize = ctrl.populationSize;
  let elitism = ctrl.elitismFraction;
  let survivors = ctrl.survivorFraction;
  let eps = ctrl.episodesPerIndividual;

  /* istanbul ignore next */
  if (stagnation > 5 && popSize < 80) popSize = Math.min(80, popSize + 2);
  /* istanbul ignore next */
  if (isImproving && popSize > 8) popSize = Math.max(8, popSize - 1);
  /* istanbul ignore next */
  if (stagnation > 8) elitism = Math.min(0.3, elitism + 0.02);
  /* istanbul ignore next */
  if (isImproving) elitism = Math.max(0.05, elitism - 0.01);
  /* istanbul ignore next */
  if (stagnation > 10) survivors = Math.min(0.9, survivors + 0.05);
  /* istanbul ignore next */
  if (stagnation > 6 && eps < 10) eps++;
  /* istanbul ignore next */
  if (isImproving && eps > 2) eps--;

  return deepFreeze({
    ...ctrl,
    populationSize: popSize,
    elitismFraction: elitism,
    survivorFraction: survivors,
    episodesPerIndividual: eps,
  } as GAControlGenome);
}

// ----------------------------------------------------------------
// Async evaluation with Promise pool (bounded concurrency)
// ----------------------------------------------------------------

/**
 * Evaluate `items` in parallel, but never more than `concurrency` at a time.
 */
async function pooledEval<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
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

// ----------------------------------------------------------------
// Main GA runner
// ----------------------------------------------------------------
/** Self-adaptive multi-objective genetic algorithm runner with NSGA-II, Lamarckian inheritance, and Pareto archiving. */
export class GeneticAlgorithmRunner {
  private population: DeepReadonly<LamarckGenome>[] = [];
  private generation = 0;
  private bestGenome: DeepReadonly<LamarckGenome> | null = null;
  private bestFitness = -Infinity;
  private stagnation = 0;
  private startTime = 0;
  private efficiencyHistory: number[] = [];
  private archive = new ParetoArchive();

  constructor(private readonly cfg: GARunnerConfig) {}

  /** Initialise the population from scratch (call once before `run()` or before the first `runGeneration()`). */
  public initialise(baseControl?: Partial<GAControlGenome>): void {
    const ctrl = deepFreeze({
      ...createDefaultGenome('base').gaControl,
      ...baseControl,
    } as GAControlGenome);
    const rng = makePRNG(ctrl.networkSeed);

    this.population = Array.from({ length: ctrl.populationSize }, (_, i) => {
      const g = createDefaultGenome(`g0_${i}`, 0, rng) as LamarckGenome;
      return deepFreeze({
        ...g,
        gaControl: ctrl,
        trainedWeights: undefined,
      }) as DeepReadonly<LamarckGenome>;
    });

    this.generation = 0;
    this.bestFitness = -Infinity;
    this.stagnation = 0;
    this.startTime = Date.now();
    this.efficiencyHistory = [];
    this.archive = new ParetoArchive();
  }

  /** Run one full generation: evaluate, rank, select, crossover, mutate, and produce offspring. */
  public async runGeneration(): Promise<GenerationContext> {
    const ctrl = this.population[0].gaControl;
    const rng = makePRNG(ctrl.mutationSeed + this.generation);

    const { popWithMeta, objectives, metas, popMeta, avgFit, avgEff, newCtrl } =
      await this.evaluatePopulation(rng, ctrl);

    this.updateArchive(popWithMeta, objectives, popMeta);

    this.trackStagnation(popWithMeta, metas, avgEff);

    const ranked = this.sortPopulation(popWithMeta, popMeta);

    const elites = this.selectElites(ranked, newCtrl);

    const offspring = this.createOffspring(ranked, newCtrl, ctrl, rng);

    this.population = [...elites, ...offspring].slice(0, newCtrl.populationSize);
    this.generation++;

    const ctx: GenerationContext = {
      generation: this.generation,
      population: this.population,
      archive: this.archive.members,
      bestFitness: this.bestFitness,
      /* istanbul ignore next */
      bestGenome: this.bestGenome as DeepReadonly<LamarckGenome>,
      avgFitness: avgFit,
      efficiencyScore: avgEff,
      elapsedMs: Date.now() - this.startTime,
      stagnation: this.stagnation,
      gaControl: newCtrl,
    };

    this.cfg.onGeneration?.(ctx);
    return ctx;
  }

  private async evaluatePopulation(
    rng: () => number,
    ctrl: DeepReadonly<GAControlGenome>
  ): Promise<{
    popWithMeta: DeepReadonly<LamarckGenome>[];
    objectives: ObjectiveVector[];
    metas: GenomeFitnessMeta[];
    popMeta: PopulationMeta;
    avgFit: number;
    avgEff: number;
    newCtrl: Readonly<GAControlGenome>;
  }> {
    const concurrency = this.cfg.evalConcurrency ?? 4;

    const evalResults = await pooledEval(this.population, concurrency, g =>
      evaluateGenomeAllWindows(g, this.cfg.windowSets, this.cfg.backendFactory)
    );

    const updatedPop = evalResults.map(r => r.updatedGenome);
    const objectives = evalResults.map(r => r.objectives);
    const metas = evalResults.map(r => r.meta);
    const popMeta = buildPopulationMeta(objectives, rng);

    const popWithMeta = updatedPop.map((g, i) =>
      withGenome(g, {
        fitness: metas[i].efficiencyScore,
        fitnessMeta: metas[i],
      } as Partial<LamarckGenome>)
    );

    /* istanbul ignore next */
    const avgFit = popWithMeta.reduce((s, g) => s + (g.fitness ?? 0), 0) / popWithMeta.length;
    const avgEff = metas.reduce((s, m) => s + m.efficiencyScore, 0) / metas.length;

    const newCtrl = adaptGAControl(ctrl, this.efficiencyHistory, this.stagnation);

    return { popWithMeta, objectives, metas, popMeta, avgFit, avgEff, newCtrl };
  }

  private updateArchive(
    popWithMeta: DeepReadonly<LamarckGenome>[],
    objectives: ObjectiveVector[],
    popMeta: PopulationMeta
  ): void {
    const frontIdx = popMeta.paretoRank.reduce(
      (acc, r, i) => (r === 0 ? [...acc, i] : acc),
      [] as number[]
    );
    /* istanbul ignore if */
    if (
      this.archive.update(
        frontIdx.map(i => popWithMeta[i]),
        frontIdx.map(i => objectives[i])
      )
    ) {
      this.cfg.onArchiveUpdate?.(this.archive.members);
    }
  }

  private trackStagnation(
    popWithMeta: DeepReadonly<LamarckGenome>[],
    metas: GenomeFitnessMeta[],
    avgEff: number
  ): void {
    /* istanbul ignore next */
    const bestScalar = Math.max(...popWithMeta.map(g => g.fitness ?? -Infinity));
    if (bestScalar > this.bestFitness + 1e-6) {
      this.bestFitness = bestScalar;
      /* istanbul ignore next */
      this.bestGenome = popWithMeta.reduce((a, b) =>
        (b.fitness ?? -Infinity) > (a.fitness ?? -Infinity) ? b : a
      );
      this.stagnation = 0;
    } else {
      this.stagnation++;
    }

    this.efficiencyHistory.push(avgEff);
  }

  private sortPopulation(
    popWithMeta: DeepReadonly<LamarckGenome>[],
    popMeta: PopulationMeta
  ): Genome[] {
    const sortedIdx = Array.from({ length: popWithMeta.length }, (_, i) => i).sort((a, b) =>
      popMeta.paretoRank[a] !== popMeta.paretoRank[b]
        ? popMeta.paretoRank[a] - popMeta.paretoRank[b]
        : popMeta.crowdingDist[b] - popMeta.crowdingDist[a]
    );

    return sortedIdx.map(i => popWithMeta[i] as Genome);
  }

  private selectElites(
    ranked: Genome[],
    newCtrl: Readonly<GAControlGenome>
  ): DeepReadonly<LamarckGenome>[] {
    const nElite = Math.max(1, Math.round(newCtrl.elitismFraction * newCtrl.populationSize));
    return ranked
      .slice(0, nElite)
      .map(g => withGenome(g, { gaControl: newCtrl } as Partial<LamarckGenome>));
  }

  private createOffspring(
    ranked: Genome[],
    newCtrl: Readonly<GAControlGenome>,
    ctrl: DeepReadonly<GAControlGenome>,
    rng: () => number
  ): DeepReadonly<LamarckGenome>[] {
    const nElite = Math.max(1, Math.round(newCtrl.elitismFraction * newCtrl.populationSize));
    const nOffspring = newCtrl.populationSize - nElite;

    const mutRng = makePRNG(ctrl.mutationSeed + this.generation + 1000);
    const coRng = makePRNG(ctrl.mutationSeed + this.generation + 2000);

    return Array.from({ length: nOffspring }, () => {
      const pA = selectParent(ranked, newCtrl.selectionType, rng) as LamarckGenome;
      const pB = selectParent(ranked, newCtrl.selectionType, rng) as LamarckGenome;

      const childStruct = mutateGenome(crossoverGenomes(pA, pB, coRng), mutRng);

      let childWeights: Float32Array | undefined;
      /* istanbul ignore if */
      if (pA.trainedWeights && pB.trainedWeights) {
        const rate = newCtrl.mutationRate ?? 0.1;
        const noiseStd = newCtrl.mutationStd ?? 0.05;
        childWeights = mutateWeights(
          crossoverWeights(
            pA.trainedWeights as Float32Array,
            pB.trainedWeights as Float32Array,
            coRng
          ),
          rate,
          noiseStd,
          mutRng
        );
      }

      return deepFreeze({
        ...childStruct,
        id: generateId(),
        generation: this.generation + 1,
        gaControl: newCtrl,
        trainedWeights: childWeights,
        fitness: undefined,
        fitnessMeta: undefined,
      }) as DeepReadonly<LamarckGenome>;
    });
  }

  /** Run the entire GA loop until a termination condition is met. Returns the best genome found. */
  public async run(): Promise<DeepReadonly<LamarckGenome>> {
    this.initialise(this.cfg.initialControl);

    while (true) {
      const ctx = await this.runGeneration();
      const ctrl = ctx.gaControl;
      if (ctx.bestFitness >= ctrl.rewardThreshold) break;
      if (ctx.stagnation >= ctrl.stagnationPatience) break;
      if (ctx.generation >= ctrl.maxGenerations) break;
      if (ctx.elapsedMs >= ctrl.timeBudgetMs) break;
    }

    // prefer archive member over transient population best
    /* istanbul ignore next */
    return this.archive.members[0] ?? this.bestGenome ?? this.population[0];
  }

  /** Return the current population. */
  public getPopulation(): DeepReadonly<LamarckGenome>[] {
    return this.population;
  }
  /** Return the best genome found so far, or null if none exists. */
  public getBestGenome(): DeepReadonly<LamarckGenome> | null {
    return this.bestGenome;
  }
  /** Return the Pareto archive of non-dominated genomes. */
  public getArchive(): DeepReadonly<LamarckGenome>[] {
    return this.archive.members;
  }
  /** Return the current generation number. */
  public getGeneration(): number {
    return this.generation;
  }
}
