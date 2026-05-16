/**
 * GeneticAlgorithmRunner (Refactored)
 * 
 * Orchestrates the evolutionary process by delegating to specialized engines:
 * - EvaluationPipeline: trains and evaluates genomes
 * - ParetoEngine: maintains Pareto front and ranking
 * - ComplexityEstimator: estimates model efficiency penalties
 * - AdaptiveControlSystem: adjusts GA parameters over time
 * - EvolutionEngine: applies genetic operators (mutation, crossover, selection)
 */

import type { Genome, GAControlGenome, LamarckGenome, MarketStep } from "./genome_types";
import type { Experience } from "core/neural_network/type";

import TradingAgent, { TradingAgentConfig } from "../agent/trading_agent";
import { createDefaultGenome } from "./factory";
import { generateId } from "./utils";
import { makePRNG } from "./prng";

// Modular imports
import { evaluateGenomeAllWindows, pooledEval } from "./evaluation_pipeline";
import type { BackendFactory } from "./evaluation_pipeline";
import { buildPopulationMeta, ParetoArchive, ObjectiveVector } from "./pareto_engine";
import { adaptGAControl, checkTerminationConditions } from "./adaptive_control_system";
import { crossoverWeights, mutateWeights, selectParent, mutateGenome, crossoverGenomes } from "./evolution_engine";

// ================================================================
// Immutability & Type Helpers
// ================================================================

type DeepReadonly<T> =
  T extends (infer U)[] ? ReadonlyArray<DeepReadonly<U>> :
  T extends object      ? { readonly [K in keyof T]: DeepReadonly<T[K]> } :
  T;

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

function withGenome<T extends Genome>(
  base: DeepReadonly<T>,
  patch: Partial<T>,
): DeepReadonly<T> {
  return deepFreeze({ ...base, ...patch } as T) as DeepReadonly<T>;
}

// ================================================================
// RL Backend Interface & TradingAgent Adaptor
// ================================================================

export interface RLBackend {
  /**
   * Pure read of network output — does NOT push to experience pool.
   */
  forwardPass(features: Float32Array): Float32Array;
  /**
   * Full environment step: inference + trade execution + reward.
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

/**
 * Adapt TradingAgent to the RLBackend interface.
 * This is the only place where TradingAgent is instantiated in the GA runner.
 */
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
      activationFunctions: g.network.hiddenLayers.map(l => l.activation),
      connectionTypes:     g.network.hiddenLayers.map(l => l.connectionType),
      biasTypes:           g.network.hiddenLayers.map(l => l.biasType),
      normalization:       g.network.normalization,
      enablePool:          true,
      poolMaxSize:         rb.bufferSize,
    },
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
 
  const agent = new TradingAgent(cfg);

  if (g.trainedWeights) {
    try { agent.agent.nn.setWeights(new Float32Array(g.trainedWeights)); }
    catch (_) { /* architecture mismatch after structural mutation — start fresh */ }
  }

  return {
    forwardPass:       (f)     => agent.agent.nn.forward(f).output,
    step:              (f, p)  => agent.step(f, p),
    train:             (e, γ)  => { try { agent.agent.learnQLearning(e, γ); } catch (_) {} },
    getWeights:        ()      => agent.agent.nn.getWeights(),
    setWeights:        (w)     => agent.agent.nn.setWeights(w),
    getPnL:            ()      => agent.wallet.getPnL(),
    resetEpisode:      ()      => agent.resetEpisode(),
    getExperiencePool: ()      => agent.agent.getPool(),
  };
}

// ================================================================
// Configuration Types
// ================================================================

export type WindowSet = {
  id:         string;
  train:      MarketStep[];
  validation: MarketStep[];
};

export type GARunnerConfig = {
  windowSets:        WindowSet[];
  backendFactory:    BackendFactory;
  evalConcurrency?:  number;
  onGeneration?:     (ctx: GenerationContext) => void;
  onArchiveUpdate?:  (archive: DeepReadonly<LamarckGenome>[]) => void;
  initialControl?:   Partial<GAControlGenome>;
};

export type GenerationContext = {
  generation:      number;
  population:      DeepReadonly<LamarckGenome>[];
  archive:         DeepReadonly<LamarckGenome>[];
  bestFitness:     number;
  bestGenome:      DeepReadonly<LamarckGenome>;
  avgFitness:      number;
  efficiencyScore: number;
  elapsedMs:       number;
  stagnation:      number;
  gaControl:       DeepReadonly<GAControlGenome>;
};

// ================================================================
// Main GA Runner Class
// ================================================================

/**
 * Orchestrates the evolutionary process.
 * 
 * Responsibilities:
 * - Initialize and manage population
 * - Delegate evaluation to EvaluationPipeline
 * - Delegate ranking to ParetoEngine
 * - Delegate control adaptation to AdaptiveControlSystem
 * - Apply genetic operators via EvolutionEngine
 * - Maintain global state (generation, fitness, stagnation)
 * 
 * Does NOT directly implement:
 * - Training/evaluation logic (→ EvaluationPipeline)
 * - Complexity estimation (→ ComplexityEstimator)
 * - NSGA-II ranking (→ ParetoEngine)
 * - Parameter adaptation (→ AdaptiveControlSystem)
 * - Mutation/crossover operators (→ EvolutionEngine)
 */
export class GeneticAlgorithmRunner {
  private population:        DeepReadonly<LamarckGenome>[] = [];
  private generation         = 0;
  private bestGenome:        DeepReadonly<LamarckGenome> | null = null;
  private bestFitness        = -Infinity;
  private stagnation         = 0;
  private startTime          = 0;
  private efficiencyHistory: number[] = [];
  private archive            = new ParetoArchive();

  constructor(private readonly cfg: GARunnerConfig) {}
 
  /**
   * Initialize population with default genomes.
   */
  public initialise(baseControl?: Partial<GAControlGenome>): void {
    const ctrl = deepFreeze({
      ...createDefaultGenome("base").gaControl,
      ...baseControl
    } as GAControlGenome);
    const rng  = makePRNG(ctrl.networkSeed);
 
    this.population = Array.from({ length: ctrl.populationSize }, (_, i) => {
      const g = createDefaultGenome(`g0_${i}`, 0, rng) as LamarckGenome;
      return deepFreeze({
        ...g,
        gaControl: ctrl,
        trainedWeights: undefined
      }) as DeepReadonly<LamarckGenome>;
    });
 
    this.generation        = 0;
    this.bestFitness       = -Infinity;
    this.stagnation        = 0;
    this.startTime         = Date.now();
    this.efficiencyHistory = [];
    this.archive           = new ParetoArchive();
  }
 
  /**
   * Execute one generation:
   * 1. Evaluate all individuals (in parallel)
   * 2. Rank via NSGA-II
   * 3. Update Pareto archive
   * 4. Apply genetic operators (elitism + reproduction)
   * 5. Adapt control parameters
   * 6. Check termination conditions
   */
  public async runGeneration(): Promise<GenerationContext> {
    const ctrl        = this.population[0].gaControl;
    const rng         = makePRNG(ctrl.mutationSeed + this.generation);
    const concurrency = this.cfg.evalConcurrency ?? 4;
 
    // ---- Phase 1: Parallel Evaluation ----
    const evalResults = await pooledEval(
      this.population,
      concurrency,
      g => evaluateGenomeAllWindows(g, this.cfg.windowSets, this.cfg.backendFactory),
    );
 
    const updatedPop = evalResults.map(r => r.updatedGenome);
    const objectives = evalResults.map(r => r.objectives);
    const metas      = evalResults.map(r => r.meta);
    const popMeta    = buildPopulationMeta(objectives, rng);
 
    // Attach fitness metadata immutably
    const popWithMeta = updatedPop.map((g, i) =>
      withGenome(g, {
        fitness: metas[i].efficiencyScore,
        fitnessMeta: metas[i]
      } as Partial<LamarckGenome>),
    );
 
    // ---- Phase 2: Archive Update ----
    const frontIdx = popMeta.paretoRank.reduce(
      (acc, r, i) => (r === 0 ? [...acc, i] : acc),
      [] as number[]
    );
    if (this.archive.update(
      frontIdx.map(i => popWithMeta[i]),
      frontIdx.map(i => objectives[i])
    )) {
      this.cfg.onArchiveUpdate?.(this.archive.members);
    }
 
    // ---- Phase 3: Track Stagnation ----
    const bestScalar = Math.max(...popWithMeta.map(g => g.fitness ?? -Infinity));
    if (bestScalar > this.bestFitness + 1e-6) {
      this.bestFitness = bestScalar;
      this.bestGenome  = popWithMeta.reduce((a, b) =>
        (b.fitness ?? -Infinity) > (a.fitness ?? -Infinity) ? b : a
      );
      this.stagnation  = 0;
    } else {
      this.stagnation++;
    }
 
    const avgFit = popWithMeta.reduce((s, g) => s + (g.fitness ?? 0), 0) / popWithMeta.length;
    const avgEff = metas.reduce((s, m) => s + m.efficiencyScore, 0) / metas.length;
    this.efficiencyHistory.push(avgEff);
 
    // ---- Phase 4: Adapt Control Parameters ----
    const newCtrl = adaptGAControl(ctrl, this.efficiencyHistory, this.stagnation);
 
    // ---- Phase 5: NSGA-II Selection & Reproduction ----
    const sortedIdx = Array.from({ length: popWithMeta.length }, (_, i) => i).sort((a, b) =>
      popMeta.paretoRank[a] !== popMeta.paretoRank[b]
        ? popMeta.paretoRank[a] - popMeta.paretoRank[b]
        : popMeta.crowdingDist[b] - popMeta.crowdingDist[a],
    );
 
    const ranked = sortedIdx.map(i => popWithMeta[i] as Genome);
 
    // Elitism: keep top individuals
    const nElite   = Math.max(1, Math.round(newCtrl.elitismFraction * newCtrl.populationSize));
    const elites   = ranked.slice(0, nElite).map(g =>
      withGenome(g, { gaControl: newCtrl } as Partial<LamarckGenome>),
    );
 
    // ---- Phase 6: Offspring Generation ----
    const mutRng = makePRNG(ctrl.mutationSeed + this.generation + 1000);
    const coRng  = makePRNG(ctrl.mutationSeed + this.generation + 2000);
 
    const nOffspring = newCtrl.populationSize - nElite;
    const offspring: DeepReadonly<LamarckGenome>[] = Array.from({ length: nOffspring }, () => {
      const pA = selectParent(ranked, newCtrl.selectionType, rng) as LamarckGenome;
      const pB = selectParent(ranked, newCtrl.selectionType, rng) as LamarckGenome;
 
      // Structural crossover and mutation
      const childStruct = mutateGenome(crossoverGenomes(pA, pB, coRng), mutRng);
 
      // Weight-level crossover + Gaussian mutation
      let childWeights: Float32Array | undefined;
      if (pA.trainedWeights && pB.trainedWeights) {
        const co = crossoverWeights(pA.trainedWeights, pB.trainedWeights, coRng);
        childWeights = mutateWeights(
          co,
          newCtrl.weightMutationRate,
          newCtrl.weightMutationStd,
          mutRng,
        );
      }
 
      const child = withGenome(childStruct as Genome, {
        id: generateId(),
        gaControl: newCtrl,
        trainedWeights: childWeights,
      } as Partial<LamarckGenome>);

      return deepFreeze(child) as DeepReadonly<LamarckGenome>;
    });
 
    this.population = [...elites, ...offspring].slice(0, newCtrl.populationSize);
    this.generation++;
 
    // ---- Generate Report ----
    const ctx: GenerationContext = {
      generation:      this.generation,
      population:      this.population,
      archive:         this.archive.members,
      bestFitness:     this.bestFitness,
      bestGenome:      this.bestGenome ?? ranked[0],
      avgFitness:      avgFit,
      efficiencyScore: avgEff,
      elapsedMs:       Date.now() - this.startTime,
      stagnation:      this.stagnation,
      gaControl:       newCtrl,
    };
 
    this.cfg.onGeneration?.(ctx);
    return ctx;
  }
 
  /**
   * Run the evolutionary loop until a termination condition is met.
   */
  public async run(): Promise<DeepReadonly<LamarckGenome>> {
    this.initialise(this.cfg.initialControl);
 
    while (true) {
      const ctx = await this.runGeneration();
      const { shouldStop, reason } = checkTerminationConditions(
        ctx.generation,
        ctx.bestFitness,
        ctx.stagnation,
        ctx.elapsedMs,
        ctx.gaControl,
      );
      if (shouldStop) {
        console.log(`[GA] Terminating: ${reason}`);
        break;
      }
    }
 
    // Prefer archive member over transient population best
    return this.archive.members[0] ?? this.bestGenome ?? this.population[0];
  }
 
  // ---- Accessors ----
  public getPopulation(): DeepReadonly<LamarckGenome>[] { return this.population; }
  public getBestGenome(): DeepReadonly<LamarckGenome> | null { return this.bestGenome; }
  public getArchive():    DeepReadonly<LamarckGenome>[] { return this.archive.members; }
  public getGeneration(): number { return this.generation; }
}
