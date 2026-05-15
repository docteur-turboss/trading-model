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

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
export type GARunnerConfig = {
  /** Initial market data stream for evaluation */
  marketData: MarketStep[];
  /** Hook called after each generation */
  onGeneration?: (ctx: GenerationContext) => void;
  /** Hook called when a new best genome is found */
  onNewBest?: (genome: Genome, fitness: number) => void;
  /** Override initial GA control parameters */
  initialControl?: Partial<GAControlGenome>;
};

export type GenerationContext = {
  generation:     number;
  population:     Genome[];
  bestFitness:    number;
  bestGenome:     Genome;
  avgFitness:     number;
  efficiencyScore:number;
  elapsedMs:      number;
  stagnation:     number;
  gaControl:      GAControlGenome;
};

// ----------------------------------------------------------------
// Running stats for reward normalization (Welford online)
// ----------------------------------------------------------------
class RunningStats {
  private n = 0;
  private mean = 0;
  private M2   = 0;

  update(x: number) {
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
function buildAgentFromGenome(g: Genome): TradingAgent {
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
// Evaluate a single genome over multiple episodes
// ----------------------------------------------------------------
async function evaluateGenome(
  g: Genome,
  marketData: MarketStep[],
  rng: () => number,
): Promise<GenomeFitnessMeta> {
  const ctrl  = g.gaControl;
  const rShape = g.rl.rewardShaping;
  const horizon = g.rl.horizon;
  const runStats = new RunningStats();

  const t0 = Date.now();
  const rawScores: number[] = [];

  for (let ep = 0; ep < ctrl.episodesPerIndividual; ep++) {
    const agent = buildAgentFromGenome(g);
    const env   = new AutoEnv(agent, {});
    env.reset();

    let episodeReward = 0;
    let stepCount     = 0;
    let frameAccum    = 0;
    let lastOutput: Float32Array | null = null;

    // PER beta annealing
    let beta = g.rl.replayBuffer.betaPER;

    for (let t = 0; t < Math.min(marketData.length, horizon.maxEpisodeLength); t++) {
      const step = marketData[t];

      // Frame skip: repeat last action
      frameAccum++;
      if (frameAccum < horizon.frameSkip && lastOutput !== null) continue;
      frameAccum = 0;

      // Softmax policy override
      const output = agent.agent.nn.forward(step.features).output;
      lastOutput   = output;

      let action: "buy" | "sell" | "hold";
      if (g.rl.discretePolicy.type === "softmax") {
        action = sampleSoftmax(output, g.rl.discretePolicy.temperature, rng);
      } else {
        // epsilon-greedy handled inside TradingAgent via StateManager
        action = agent.mapOutputToAction(output).action;
      }

      const { reward } = agent.step(step.features, step.price);

      // Reward shaping
      let shaped = shapeReward(reward, rShape);
      if (rShape.normalize) shaped = runStats.normalize(shaped);
      runStats.update(shaped);

      // Sparse: only accumulate at episode end
      if (!rShape.sparse) episodeReward += shaped;

      // Q-learning update
      const pool = agent.agent.getPool();
      if (pool.length >= 2) {
        const exp = pool[pool.length - 1];
        const prevExp = pool[pool.length - 2];
        if (prevExp && step.features) {
          // n-step return approximation
          let nStepReturn = shaped;
          for (let ns = 1; ns < horizon.nStepReturn && t + ns < marketData.length; ns++) {
            const futureReward = shapeReward(
              agent.step(marketData[t + ns].features, marketData[t + ns].price).reward,
              rShape,
            );
            nStepReturn += Math.pow(g.rl.gamma, ns) * futureReward;
          }

          // Inject nextState and reward back into the experience for Q-update
          const expWithData = {
            ...prevExp,
            reward:    nStepReturn,
            nextState: step.features,
            done:      t === horizon.maxEpisodeLength - 1,
          };
          try {
            agent.agent.learnQLearning(expWithData, g.rl.gamma);
          } catch (_) { /* pool sync mismatch — skip */ }
        }
      }

      stepCount++;

      // PER beta anneal
      if (g.rl.replayBuffer.betaAnneal) {
        beta = Math.min(1, beta + (1 - g.rl.replayBuffer.betaPER) / horizon.maxEpisodeLength);
      }
    }

    if (rShape.sparse) {
      episodeReward = agent.wallet.getPnL();
    }

    rawScores.push(episodeReward);
    agent.resetEpisode();
  }

  const computeMs = Date.now() - t0;
  const fitness   = computeFitness(ctrl.fitnessType, rawScores);
  const variance  = computeVariance(rawScores);

  return {
    episodesRun:     rawScores.length,
    computeMs,
    efficiencyScore: computeMs > 0 ? fitness / computeMs : 0,
    variance,
    rawScores,
  };
}

// ----------------------------------------------------------------
// Self-adaptive GA control update
// ----------------------------------------------------------------
function adaptGAControl(
  ctrl: GAControlGenome,
  effHistory: number[],
  stagnation: number,
  generation: number,
): GAControlGenome {
  const n = effHistory.length;
  if (n < 3) return ctrl;

  const recentEff  = effHistory.slice(-5);
  const trend      = recentEff[recentEff.length - 1] - recentEff[0];
  const isImproving = trend > 0;

  // Adapt population size: shrink when efficient, grow when stagnating
  let popSize = ctrl.populationSize;
  if (stagnation > 5 && popSize < 80)  popSize = Math.min(80, popSize + 2);
  if (isImproving && popSize > 8)      popSize = Math.max(8, popSize - 1);

  // Elitism: increase when good, relax when stagnating
  let elitism = ctrl.elitismFraction;
  if (stagnation > 8) elitism = Math.min(0.3, elitism + 0.02);
  if (isImproving)    elitism = Math.max(0.05, elitism - 0.01);

  // Survivor fraction: broaden search space on stagnation
  let survivors = ctrl.survivorFraction;
  if (stagnation > 10) survivors = Math.min(0.9, survivors + 0.05);

  // Episodes per individual: increase budget when variance is high
  let eps = ctrl.episodesPerIndividual;
  if (stagnation > 6 && eps < 10) eps++;
  if (isImproving && eps > 2)    eps--;

  // Rotate fitness type on prolonged stagnation (explore different objectives)
  const fitnessTypes: FitnessType[] = ["total_pnl", "sharpe", "sortino", "calmar", "composite"];
  let fitnessType = ctrl.fitnessType;
  if (stagnation > ctrl.stagnationPatience * 0.5) {
    fitnessType = fitnessTypes[(generation) % fitnessTypes.length];
  }

  return {
    ...ctrl,
    populationSize:        popSize,
    elitismFraction:       elitism,
    survivorFraction:      survivors,
    episodesPerIndividual: eps,
    fitnessType,
  };
}

// ----------------------------------------------------------------
// Main GA runner
// ----------------------------------------------------------------
export class GeneticAlgorithmRunner {
  private population: Genome[] = [];
  private generation  = 0;
  private bestGenome: Genome | null = null;
  private bestFitness = -Infinity;
  private stagnation  = 0;
  private startTime   = 0;
  private efficiencyHistory: number[] = [];

  constructor(private readonly cfg: GARunnerConfig) {}

  /** Initialise a random population */
  public initialise(baseControl?: Partial<GAControlGenome>): void {
    const ctrl = { ...createDefaultGenome("base").gaControl, ...baseControl };
    const rng  = makePRNG(ctrl.networkSeed);

    this.population = Array.from({ length: ctrl.populationSize }, (_, i) => {
      const g = createDefaultGenome(`g0_${i}`, 0, rng);
      g.gaControl = ctrl;
      return g;
    });

    this.generation   = 0;
    this.bestFitness  = -Infinity;
    this.stagnation   = 0;
    this.startTime    = Date.now();
  }

  /** Run one complete generation: evaluate → select → reproduce */
  public async runGeneration(): Promise<GenerationContext> {
    const ctrl   = this.population[0].gaControl;
    const rng    = makePRNG(ctrl.mutationSeed + this.generation);
    const envRng = makePRNG(ctrl.envSeed      + this.generation);

    // ---- Evaluation ----
    for (const genome of this.population) {
      const meta = await evaluateGenome(genome, this.cfg.marketData, envRng);
      genome.fitness     = meta.efficiencyScore > 0
        ? computeFitness(genome.gaControl.fitnessType, meta.rawScores)
        : -Infinity;
      genome.fitnessMeta = meta;
    }

    // ---- Sort by fitness ----
    this.population.sort((a, b) => (b.fitness ?? -Infinity) - (a.fitness ?? -Infinity));

    const best    = this.population[0];
    const avgFit  = this.population.reduce((s, g) => s + (g.fitness ?? 0), 0) / this.population.length;
    const avgEff  = this.population.reduce((s, g) => s + (g.fitnessMeta?.efficiencyScore ?? 0), 0) / this.population.length;

    this.efficiencyHistory.push(avgEff);

    // Track stagnation
    if ((best.fitness ?? -Infinity) > this.bestFitness + 1e-6) {
      this.bestFitness = best.fitness!;
      this.bestGenome  = best;
      this.stagnation  = 0;
      this.cfg.onNewBest?.(best, this.bestFitness);
    } else {
      this.stagnation++;
    }

    // ---- Self-adapt GA control ----
    const newCtrl = adaptGAControl(ctrl, this.efficiencyHistory, this.stagnation, this.generation);

    // ---- Elitism ----
    const nElite     = Math.max(1, Math.round(newCtrl.elitismFraction * newCtrl.populationSize));
    const elites     = this.population.slice(0, nElite).map(g => ({ ...g, gaControl: newCtrl }));

    // ---- Selection + Reproduction ----
    const nOffspring = newCtrl.populationSize - nElite;
    const offspring: Genome[] = [];

    const mutRng  = makePRNG(ctrl.mutationSeed + this.generation + 1000);
    const coRng   = makePRNG(ctrl.mutationSeed + this.generation + 2000);

    for (let i = 0; i < nOffspring; i++) {
      const parentA = selectParent(this.population, newCtrl.selectionType, rng);
      const parentB = selectParent(this.population, newCtrl.selectionType, rng);

      let child = crossoverGenomes(parentA, parentB, coRng);
      child     = mutateGenome(child, mutRng);
      child.id         = generateId();
      child.generation = this.generation + 1;
      child.gaControl  = newCtrl;
      child.fitness    = undefined;
      child.fitnessMeta = undefined;
      offspring.push(child);
    }

    // ---- Survivor selection ----
    const nSurvivors = Math.round(newCtrl.survivorFraction * this.population.length);
    const survivors  = this.population.slice(0, nSurvivors).map(g => ({ ...g, gaControl: newCtrl }));

    // Merge: elites + offspring, trimmed to new pop size
    this.population = [...elites, ...offspring]
      .slice(0, newCtrl.populationSize);

    this.generation++;

    const ctx: GenerationContext = {
      generation:     this.generation,
      population:     this.population,
      bestFitness:    this.bestFitness,
      bestGenome:     this.bestGenome ?? best,
      avgFitness:     avgFit,
      efficiencyScore:avgEff,
      elapsedMs:      Date.now() - this.startTime,
      stagnation:     this.stagnation,
      gaControl:      newCtrl,
    };

    this.cfg.onGeneration?.(ctx);
    return ctx;
  }

  /** Run until a stopping criterion is met */
  public async run(): Promise<Genome> {
    this.initialise(this.cfg.initialControl);

    while (true) {
      const ctx = await this.runGeneration();
      const ctrl = ctx.gaControl;

      // Stopping criteria
      if (ctx.bestFitness >= ctrl.rewardThreshold)               break;
      if (ctx.stagnation  >= ctrl.stagnationPatience)            break;
      if (ctx.generation  >= ctrl.maxGenerations)                break;
      if (ctx.elapsedMs   >= ctrl.timeBudgetMs)                  break;
    }

    return this.bestGenome ?? this.population[0];
  }

  public getPopulation(): Genome[] { return this.population; }
  public getBestGenome():  Genome | null { return this.bestGenome; }
  public getGeneration():  number { return this.generation; }
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
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