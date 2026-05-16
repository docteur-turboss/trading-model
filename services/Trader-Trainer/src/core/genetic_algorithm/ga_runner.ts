// ================================================================
//            Self-adaptive Genetic Algorithm runner
//   Couples with TradingAgent / AutoEnv / Deep Q-Learning agent
// ================================================================

import {
  Genome, GAControlGenome, GenomeFitnessMeta, MarketStep, FitnessType,
} from "./genome_types";
import TradingAgent, { TradingAgentConfig } from "../agent/trading_agent";
import { computeFitness, shapeReward } from "./fitness";
import { createDefaultGenome } from "./factory";
import { crossoverGenomes } from "./crossover";
import { AutoEnv } from "../agent/auto_env";
import { selectParent } from "./selection";
import { mutateGenome } from "./mutation";
import { generateId } from "./utils";
import { makePRNG } from "./prng";

/**
 * Produce a *new* genome with `patch` applied. The original is never mutated.
 * All callsites use this instead of direct property writes.
 */
function withGenome<T extends Genome>(base: Readonly<T>, patch: Partial<T>): Readonly<T> {
  return Object.freeze({ ...base, ...patch }) as Readonly<T>;
}
 
/** Deep-freeze a freshly-created genome before it enters the population. */
function freezeGenome<T extends Genome>(g: T): Readonly<T> {
  return Object.freeze(g) as Readonly<T>;
}

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
export type MarketWindow = {
  id:   string;
  data: MarketStep[];
};
 
export type GARunnerConfig = {
  /** Multiple non-overlapping market windows for diversity. */
  marketWindows: MarketWindow[];
  /** Worker concurrency cap for parallel evaluation. */
  evalConcurrency?: number;
  /** Hook called after each generation. */
  onGeneration?: (ctx: GenerationContext) => void;
  /** Hook called when a new Pareto front is found. */
  onNewFront?: (front: Readonly<Genome>[], generation: number) => void;
  /** Override initial GA control parameters. */
  initialControl?: Partial<GAControlGenome>;
};
 
export type GenerationContext = {
  generation:     number;
  population:     Readonly<Genome>[];
  paretoFront:    Readonly<Genome>[];
  bestFitness:    number;
  bestGenome:     Readonly<Genome>;
  avgFitness:     number;
  efficiencyScore:number;
  elapsedMs:      number;
  stagnation:     number;
  gaControl:      Readonly<GAControlGenome>;
};

/** All objectives we optimise simultaneously. */
type ObjectiveVector = {
  /** Average PnL across windows. */
  avgPnl:        number;
  /** Sharpe-like ratio. */
  sharpe:        number;
  /** Negative complexity (more neurons/layers = worse). */
  negComplexity: number;
};
 
/** Attach objectives and Pareto rank to a genome (immutably). */
type RankedGenome = Readonly<Genome> & {
  readonly objectives:   ObjectiveVector;
  readonly paretoRank:   number;
  readonly crowdingDist: number;
};

// ----------------------------------------------------------------
// Running stats — Welford online
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// Genome → TradingAgent bridge
// ----------------------------------------------------------------
function buildAgentFromGenome(g: Readonly<Genome>): TradingAgent {
  const dp = g.rl.discretePolicy;
  const rb = g.rl.replayBuffer;

  const nnConfig = {
    neuronsByLayer: [
      g.network.inputDim,
      ...g.network.hiddenLayers.map(l => l.neurons),
      g.network.outputDim,
    ],
    activationFunctions: g.network.hiddenLayers.map(l => l.activation),
    connectionTypes:     g.network.hiddenLayers.map(l => l.connectionType),
    biasTypes:           g.network.hiddenLayers.map(l => l.biasType),
    normalization:       g.network.normalization,
    enablePool:          true,
    poolMaxSize:         rb.bufferSize,
  };

  const cfg: TradingAgentConfig = {
    nnConfig,
    wallet:      { initialCash: 1000, initialPrice: 1 },
    actionSpace: "discrete",
    tradeAmount: 1,
    stateManagerCfg: {
      epsilonStart: dp.epsilonStart,
      epsilonMin:   dp.epsilonMin,
      epsilonDecay: dp.epsilonDecay,
      gamma:        g.rl.gamma,
    },
  };

  return new TradingAgent(cfg);
}

// ----------------------------------------------------------------
// Complexity regularisation
// ----------------------------------------------------------------
/**
 * Returns a penalty in [0, 1] based on total parameter count.
 * Larger networks incur a higher penalty on their fitness score.
 */
function complexityPenalty(g: Readonly<Genome>): number {
  const allDims = [
    g.network.inputDim,
    ...g.network.hiddenLayers.map(l => l.neurons),
    g.network.outputDim,
  ];
 
  let params = 0;
  for (let i = 1; i < allDims.length; i++) {
    params += allDims[i - 1] * allDims[i] + allDims[i]; // weights + biases
  }
 
  // Soft upper bound at 200 k params → penalty ≈ 1
  const MAX_PARAMS = 200_000;
  return Math.min(1, params / MAX_PARAMS);
}
 
// ----------------------------------------------------------------
// Dedicated train phase
// ----------------------------------------------------------------

/**
 * Runs the RL training loop on a single agent over one episode.
 * Pure side-effect on `agent`; does NOT return or contribute to fitness.
 */
async function trainAgent(
  agent: TradingAgent,
  marketData: MarketStep[],
  g: Readonly<Genome>,
  rng: () => number,
): Promise<void> {
  const horizon  = g.rl.horizon;
  const rShape   = g.rl.rewardShaping;
  const runStats = new RunningStats();
 
  // Pre-compute a look-ahead reward buffer (no side-effects later)
  const rawRewards = precomputeRewards(agent, marketData, g, rShape, runStats);
 
  for (let t = 0; t < Math.min(marketData.length, horizon.maxEpisodeLength); t++) {
    if (t % horizon.frameSkip !== 0) continue;
 
    const output = agent.agent.nn.forward(marketData[t].features).output;
    const action = pickAction(output, g, rng);  // eslint-disable-line @typescript-eslint/no-unused-vars
 
    agent.step(marketData[t].features, marketData[t].price);
 
    const pool = agent.agent.getPool();
    if (pool.length >= 2) {
      const prevExp = pool[pool.length - 2];
 
      // n-step return from pre-computed buffer (read-only look-ahead)
      const nStepReturn = computeNStepReturn(rawRewards, t, g);
 
      const expWithData = {
        ...prevExp,
        reward:    nStepReturn,
        nextState: marketData[t].features,
        done:      t === Math.min(marketData.length, horizon.maxEpisodeLength) - 1,
      };
 
      try {
        agent.agent.learnQLearning(expWithData, g.rl.gamma);
      } catch (_) { /* pool sync mismatch — skip */ }
    }
  }
}

// ----------------------------------------------------------------
// Pre-computed reward buffer
// ----------------------------------------------------------------

/**
 * One-pass over marketData: applies reward shaping without calling agent.step().
 * Used exclusively by n-step look-ahead; the agent's state is untouched.
 */
function precomputeRewards(
  agent: TradingAgent,
  marketData: MarketStep[],
  g: Readonly<Genome>,
  rShape: Genome["rl"]["rewardShaping"],
  runStats: RunningStats,
): number[] {
  // We need shaped rewards at every future timestep. We compute them from
  // a CLONE of the agent so the real agent's memory/wallet is unaffected.
  const shadow = buildAgentFromGenome(g);
  const buffer: number[] = [];
 
  for (let t = 0; t < marketData.length; t++) {
    const { reward } = shadow.step(marketData[t].features, marketData[t].price);
    let shaped = shapeReward(reward, rShape);
    if (rShape.normalize) {
      runStats.update(shaped);
      shaped = runStats.normalize(shaped);
    }
    buffer.push(shaped);
  }
 
  return buffer;
}
 
function computeNStepReturn(
  rewardBuffer: number[],
  t: number,
  g: Readonly<Genome>,
): number {
  const horizon = g.rl.horizon;
  let ret = 0;
  for (let ns = 0; ns < horizon.nStepReturn && t + ns < rewardBuffer.length; ns++) {
    ret += Math.pow(g.rl.gamma, ns) * rewardBuffer[t + ns];
  }
  return ret;
}

// ----------------------------------------------------------------
// Dedicated eval phase
// ----------------------------------------------------------------
/**
 * Evaluates a genome's performance on a single market window.
 * Always uses a fresh agent; never calls learnQLearning.
 * Returns raw episode scores and PnL for multi-objective use.
 */
async function evaluateAgent(
  g: Readonly<Genome>,
  window: MarketWindow,
  rng: () => number,
): Promise<{ rawScores: number[]; finalPnl: number; computeMs: number }> {
  const ctrl    = g.gaControl;
  const rShape  = g.rl.rewardShaping;
  const horizon = g.rl.horizon;
  const runStats = new RunningStats();
 
  const t0 = Date.now();
  const rawScores: number[] = [];
 
  for (let ep = 0; ep < ctrl.episodesPerIndividual; ep++) {
    const agent = buildAgentFromGenome(g);
    const env   = new AutoEnv(agent, {});
    env.reset();
 
    let episodeReward = 0;
 
    for (let t = 0; t < Math.min(window.data.length, horizon.maxEpisodeLength); t++) {
      if (t % horizon.frameSkip !== 0) continue;
 
      const output = agent.agent.nn.forward(window.data[t].features).output;
      pickAction(output, g, rng);
 
      const { reward } = agent.step(window.data[t].features, window.data[t].price);
 
      let shaped = shapeReward(reward, rShape);
      if (rShape.normalize) {
        runStats.update(shaped);
        shaped = runStats.normalize(shaped);
      }
 
      if (!rShape.sparse) episodeReward += shaped;
    }
 
    if (rShape.sparse) episodeReward = agent.wallet.getPnL();
    rawScores.push(episodeReward);
    agent.resetEpisode();
  }
 
  return {
    rawScores,
    finalPnl:  rawScores.reduce((s, v) => s + v, 0) / rawScores.length,
    computeMs: Date.now() - t0,
  };
}

// ----------------------------------------------------------------
// Multi-window evaluation entry point
// ----------------------------------------------------------------
 
/**
 * Trains the genome on all windows in sequence, then evaluates on all windows.
 * Returns aggregated GenomeFitnessMeta plus per-objective scores for NSGA-II.
 */
async function evaluateGenomeMultiWindow(
  g: Readonly<Genome>,
  windows: MarketWindow[],
  rng: () => number,
): Promise<{ meta: GenomeFitnessMeta; objectives: ObjectiveVector }> {
  const t0 = Date.now();
  const allRaw: number[] = [];
  const allPnl: number[] = [];
 
  for (const w of windows) {
    // --- Train phase ---
    const trainAgent_ = buildAgentFromGenome(g);
    await trainAgent(trainAgent_, w.data, g, rng);
 
    // --- Eval phase ---
    const result = await evaluateAgent(g, w, rng);
    allRaw.push(...result.rawScores);
    allPnl.push(result.finalPnl);
  }
 
  const computeMs = Date.now() - t0;
  const fitness   = computeFitness(g.gaControl.fitnessType, allRaw);
  const variance  = computeVariance(allRaw);
 
  // penalise complexity
  const penalty    = complexityPenalty(g);
  const LAMBDA     = 0.15; // regularisation strength (tune as needed)
  const adjustedFitness = fitness * (1 - LAMBDA * penalty);
 
  // build objective vector
  const avgPnl    = allPnl.reduce((s, v) => s + v, 0) / allPnl.length;
  const sharpe    = computeSharpe(allRaw);
  const negComp   = -penalty; // higher (less negative) = simpler network
 
  return {
    meta: {
      episodesRun:     allRaw.length,
      computeMs,
      efficiencyScore: computeMs > 0 ? adjustedFitness / computeMs : 0,
      variance,
      rawScores:       allRaw,
    },
    objectives: { avgPnl, sharpe, negComplexity: negComp },
  };
}

// ----------------------------------------------------------------
// NSGA-II light: Pareto dominance + crowding distance
// ----------------------------------------------------------------

function dominates(a: ObjectiveVector, b: ObjectiveVector): boolean {
  const keys = Object.keys(a) as (keyof ObjectiveVector)[];
  return (
    keys.every(k => a[k] >= b[k]) &&
    keys.some (k => a[k] >  b[k])
  );
}
 
function nondominatedSort(pop: RankedGenome[]): RankedGenome[][] {
  const n = pop.length;
  const dominated = new Array(n).fill(0);       // number of genomes dominating i
  const dominates_ = Array.from({ length: n }, () => [] as number[]); // indices i dominates
 
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (dominates(pop[i].objectives, pop[j].objectives)) {
        dominates_[i].push(j);
      } else if (dominates(pop[j].objectives, pop[i].objectives)) {
        dominated[i]++;
      }
    }
  }
 
  const fronts: number[][] = [];
  let currentFront = dominated.map((d, i) => (d === 0 ? i : -1)).filter(i => i >= 0);
  fronts.push(currentFront);
 
  while (currentFront.length > 0) {
    const nextFront: number[] = [];
    for (const i of currentFront) {
      for (const j of dominates_[i]) {
        dominated[j]--;
        if (dominated[j] === 0) nextFront.push(j);
      }
    }
    if (nextFront.length > 0) fronts.push(nextFront);
    currentFront = nextFront;
  }
 
  return fronts.map(f => f.map(i => pop[i]));
}
 
function assignCrowdingDistance(front: RankedGenome[]): RankedGenome[] {
  if (front.length === 0) return front;
  const keys = Object.keys(front[0].objectives) as (keyof ObjectiveVector)[];
  const dist = new Array(front.length).fill(0);
 
  for (const k of keys) {
    const sorted = [...front.map((g, i) => ({ v: g.objectives[k], i }))].sort((a, b) => a.v - b.v);
    dist[sorted[0].i]                      = Infinity;
    dist[sorted[sorted.length - 1].i]      = Infinity;
 
    const range = sorted[sorted.length - 1].v - sorted[0].v;
    if (range === 0) continue;
 
    for (let m = 1; m < sorted.length - 1; m++) {
      dist[sorted[m].i] += (sorted[m + 1].v - sorted[m - 1].v) / range;
    }
  }
 
  return front.map((g, i) => ({ ...g, crowdingDist: dist[i] }));
}
 
/**
 * Sort population by NSGA-II rank (front index asc, crowding distance desc).
 * Returns a new array of RankedGenome; originals are untouched.
 */
function rankPopulation(genomes: Readonly<Genome>[], objectivesMap: Map<string, ObjectiveVector>): RankedGenome[] {
  // Attach objectives to each genome (frozen, new objects)
  const withObj: RankedGenome[] = genomes.map(g => ({
    ...g,
    objectives:   objectivesMap.get(g.id) ?? { avgPnl: -Infinity, sharpe: -Infinity, negComplexity: -Infinity },
    paretoRank:   0,
    crowdingDist: 0,
  }));
 
  const fronts = nondominatedSort(withObj);
  const ranked: RankedGenome[] = [];
 
  for (let rank = 0; rank < fronts.length; rank++) {
    const spaced = assignCrowdingDistance(fronts[rank].map(g => ({ ...g, paretoRank: rank })));
    ranked.push(...spaced);
  }
 
  return ranked.sort((a, b) =>
    a.paretoRank !== b.paretoRank
      ? a.paretoRank - b.paretoRank
      : b.crowdingDist - a.crowdingDist,
  );
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
 
// ----------------------------------------------------------------
// Self-adaptive GA control update
// ----------------------------------------------------------------
function adaptGAControl(
  ctrl: Readonly<GAControlGenome>,
  effHistory: number[],
  stagnation: number,
): Readonly<GAControlGenome> {
  if (effHistory.length < 3) return ctrl;
 
  const recentEff   = effHistory.slice(-5);
  const trend       = recentEff[recentEff.length - 1] - recentEff[0];
  const isImproving = trend > 0;
 
  // Adapt population size: shrink when efficient, grow when stagnating
  let popSize   = ctrl.populationSize;
  // Elitism: increase when good, relax when stagnating
  let elitism   = ctrl.elitismFraction;
  // Survivor fraction: broaden search space on stagnation
  let survivors = ctrl.survivorFraction;
  // Episodes per individual: increase budget when variance is high
  let eps       = ctrl.episodesPerIndividual;
 
  if (stagnation > 5 && popSize < 80)  popSize = Math.min(80, popSize + 2);
  if (isImproving && popSize > 8)      popSize = Math.max(8,  popSize - 1);
 
  if (stagnation > 8) elitism = Math.min(0.3,  elitism  + 0.02);
  if (isImproving)    elitism = Math.max(0.05, elitism  - 0.01);
 
  if (stagnation > 10) survivors = Math.min(0.9, survivors + 0.05);
 
  if (stagnation > 6 && eps < 10) eps++;
  if (isImproving && eps > 2)     eps--;
 
  // no more fitness-type cycling; fitnessType now used only for meta reporting
  return Object.freeze({ ...ctrl, populationSize: popSize, elitismFraction: elitism, survivorFraction: survivors, episodesPerIndividual: eps });
}
 
// ----------------------------------------------------------------
// Main GA runner
// ----------------------------------------------------------------
export class GeneticAlgorithmRunner {
  //  population stored as frozen Genome array
  private population: Readonly<Genome>[] = [];
  private generation      = 0;
  private bestGenome:     Readonly<Genome> | null = null;
  private bestFitness     = -Infinity;
  private stagnation      = 0;
  private startTime       = 0;
  private efficiencyHistory: number[] = [];
  private paretoFront:    Readonly<Genome>[] = [];
 
  constructor(private readonly cfg: GARunnerConfig) {}
 
  /** Initialise a random, frozen population. */
  public initialise(baseControl?: Partial<GAControlGenome>): void {
    const ctrl = { ...createDefaultGenome("base").gaControl, ...baseControl };
    const rng  = makePRNG(ctrl.networkSeed);
 
    this.population = Array.from({ length: ctrl.populationSize }, (_, i) => {
      const g = createDefaultGenome(`g0_${i}`, 0, rng);
      // freeze immediately; gaControl patch produces new frozen object
      return freezeGenome({ ...g, gaControl: Object.freeze(ctrl) });
    });
 
    this.generation      = 0;
    this.bestFitness     = -Infinity;
    this.stagnation      = 0;
    this.startTime       = Date.now();
    this.efficiencyHistory = [];
    this.paretoFront     = [];
  }
 
  /** Run one complete generation: evaluate → rank → reproduce. */
  public async runGeneration(): Promise<GenerationContext> {
    const ctrl      = this.population[0].gaControl;
    const rng       = makePRNG(ctrl.mutationSeed + this.generation);
    const concurrency = this.cfg.evalConcurrency ?? 4;
 
    // Parallel evaluation across population
    const evalResults = await pooledEval(
      this.population,
      concurrency,
      genome => evaluateGenomeMultiWindow(genome, this.cfg.marketWindows, makePRNG(ctrl.envSeed + this.generation)),
    );
 
    // Build mutable objectives map (keyed by genome.id)
    const objectivesMap = new Map<string, ObjectiveVector>();
    const metaMap       = new Map<string, GenomeFitnessMeta>();
 
    for (let idx = 0; idx < this.population.length; idx++) {
      const g = this.population[idx];
      objectivesMap.set(g.id, evalResults[idx].objectives);
      metaMap.set(g.id,       evalResults[idx].meta);
    }
 
    // Attach meta to genomes immutably
    const populationWithMeta: Readonly<Genome>[] = this.population.map(g =>
      withGenome(g, {
        fitness:     evalResults[this.population.indexOf(g)].meta.efficiencyScore,
        fitnessMeta: metaMap.get(g.id),
      }),
    );
 
    // NSGA-II ranking
    const ranked = rankPopulation(populationWithMeta, objectivesMap);
 
    // New Pareto front = rank-0 genomes
    const newFront = ranked.filter(g => g.paretoRank === 0);
    if (newFront.length !== this.paretoFront.length ||
        newFront[0]?.id !== this.paretoFront[0]?.id) {
      this.paretoFront = newFront;
      this.cfg.onNewFront?.(newFront, this.generation);
    }
 
    // Stagnation: track best scalar fitness for backwards compat
    const bestScalar = Math.max(...ranked.map(g => g.fitness ?? -Infinity));
    if (bestScalar > this.bestFitness + 1e-6) {
      this.bestFitness = bestScalar;
      this.bestGenome  = ranked[0];
      this.stagnation  = 0;
    } else {
      this.stagnation++;
    }
 
    const avgFit = ranked.reduce((s, g) => s + (g.fitness ?? 0), 0) / ranked.length;
    const avgEff = ranked.reduce((s, g) => s + (g.fitnessMeta?.efficiencyScore ?? 0), 0) / ranked.length;
    this.efficiencyHistory.push(avgEff);
 
    // Self-adapt GA control 
    const newCtrl = adaptGAControl(ctrl, this.efficiencyHistory, this.stagnation);
 
    // Elitism
    const nElite  = Math.max(1, Math.round(newCtrl.elitismFraction * newCtrl.populationSize));
    const elites  = ranked.slice(0, nElite).map(g => withGenome(g, { gaControl: newCtrl }));
 
    // Selection + Reproduction 
    const nOffspring = newCtrl.populationSize - nElite;
    const mutRng  = makePRNG(ctrl.mutationSeed + this.generation + 1000);
    const coRng   = makePRNG(ctrl.mutationSeed + this.generation + 2000);
 
    const offspring: Readonly<Genome>[] = Array.from({ length: nOffspring }, () => {
      const parentA = selectParent(ranked, newCtrl.selectionType, rng);
      const parentB = selectParent(ranked, newCtrl.selectionType, rng);
 
      const child = mutateGenome(crossoverGenomes(parentA, parentB, coRng), mutRng);
      return freezeGenome({
        ...child,
        id:          generateId(),
        generation:  this.generation + 1,
        gaControl:   newCtrl,
        fitness:     undefined,
        fitnessMeta: undefined,
      });
    });
 
    this.population = [...elites, ...offspring].slice(0, newCtrl.populationSize);
    this.generation++;
 
    const ctx: GenerationContext = {
      generation:     this.generation,
      population:     this.population,
      paretoFront:    this.paretoFront,
      bestFitness:    this.bestFitness,
      bestGenome:     this.bestGenome ?? ranked[0],
      avgFitness:     avgFit,
      efficiencyScore:avgEff,
      elapsedMs:      Date.now() - this.startTime,
      stagnation:     this.stagnation,
      gaControl:      newCtrl,
    };
 
    this.cfg.onGeneration?.(ctx);
    return ctx;
  }
 
  /** Run until a stopping criterion is met. Returns the best Pareto-front genome. */
  public async run(): Promise<Readonly<Genome>> {
    this.initialise(this.cfg.initialControl);
 
    while (true) {
      const ctx  = await this.runGeneration();
      const ctrl = ctx.gaControl;
 
      if (ctx.bestFitness >= ctrl.rewardThreshold) break;
      if (ctx.stagnation  >= ctrl.stagnationPatience) break;
      if (ctx.generation  >= ctrl.maxGenerations) break;
      if (ctx.elapsedMs   >= ctrl.timeBudgetMs) break;
    }
 
    return this.bestGenome ?? this.population[0];
  }
 
  public getPopulation():  Readonly<Genome>[] { return this.population; }
  public getBestGenome():  Readonly<Genome> | null { return this.bestGenome; }
  public getParetoFront(): Readonly<Genome>[] { return this.paretoFront; }
  public getGeneration():  number { return this.generation; }
}
 
// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function pickAction(
  output: Float32Array,
  g: Readonly<Genome>,
  rng: () => number,
): "buy" | "sell" | "hold" {
  if (g.rl.discretePolicy.type === "softmax") {
    return sampleSoftmax(output, g.rl.discretePolicy.temperature, rng);
  }
  // epsilon-greedy is handled internally by TradingAgent / StateManager
  const idx = Array.from(output).indexOf(Math.max(...Array.from(output)));
  return idx === 0 ? "sell" : idx === 1 ? "hold" : "buy";
}
 
function sampleSoftmax(
  output: Float32Array,
  temperature: number,
  rng: () => number,
): "buy" | "sell" | "hold" {
  const scaled = Array.from(output).map(v => Math.exp(v / Math.max(1e-6, temperature)));
  const sum    = scaled.reduce((s, v) => s + v, 0);
  const probs  = scaled.map(v => v / sum);
 
  let pick = rng();
  for (let i = 0; i < probs.length; i++) {
    pick -= probs[i];
    if (pick <= 0) return i === 0 ? "sell" : i === 1 ? "hold" : "buy";
  }
  return "hold";
}
 
function computeVariance(scores: number[]): number {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  return scores.map(v => (v - mean) ** 2).reduce((s, v) => s + v, 0) / (scores.length - 1);
}
 
function computeSharpe(scores: number[]): number {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const std  = Math.sqrt(computeVariance(scores));
  return std < 1e-8 ? 0 : mean / std;
}