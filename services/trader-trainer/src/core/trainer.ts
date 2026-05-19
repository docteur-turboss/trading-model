import { GeneticAlgorithmRunner } from './genetic-algorithm/ga-runner';
import { createDefaultGenome } from './genetic-algorithm/factory';
import { MarketDataBuffer } from './market-data-buffer';
import { LamarckGenome } from './genetic-algorithm/genome-types';
import { DeepReadonly } from './genetic-algorithm/shared-types';
import { makeTradingAgentBackend, GenerationContext } from './genetic-algorithm/ga-runner';
import { env } from '../config/env';

export type BestAgentSummary = {
  id: string;
  generation: number;
  fitness: number;
  sharpe: number;
  avgPnl: number;
  negFlops: number;
  complexityPenalty: number;
  gaControl: {
    populationSize: number;
    elitismFraction: number;
    survivorFraction: number;
    episodesPerIndividual: number;
    selectionType: string;
    fitnessType: string;
  };
  network: {
    inputDim: number;
    outputDim: number;
    hiddenLayers: { neurons: number; activation: string }[];
  };
  rl: {
    gamma: number;
    learningRate: number;
    epsilonStart: number;
    epsilonMin: number;
    epsilonDecay: number;
  };
};

export class Trainer {
  private runner: GeneticAlgorithmRunner | null = null;
  private bestGenome: DeepReadonly<LamarckGenome> | null = null;
  private training = false;
  private generationContext: GenerationContext | null = null;
  private currentSymbol: string = '';

  constructor(private readonly dataBuffer: MarketDataBuffer) {}

  isTraining(): boolean {
    return this.training;
  }

  getCurrentSymbol(): string {
    return this.currentSymbol;
  }

  getGeneration(): number {
    return this.runner?.getGeneration() ?? 0;
  }

  async train(symbol: string): Promise<void> {
    if (this.training) return;

    const windowSet = this.dataBuffer.getAllWindows(symbol, env.TRAINER_VALIDATION_SPLIT);

    if (!windowSet || windowSet.train.length < 10) {
      console.warn(`[Trainer] Not enough data for ${symbol}, need at least 10 steps`);
      return;
    }

    this.currentSymbol = symbol;
    this.training = true;

    const defaultControl = createDefaultGenome('ctrl').gaControl;

    this.runner = new GeneticAlgorithmRunner({
      windowSets: [windowSet],
      backendFactory: makeTradingAgentBackend,
      evalConcurrency: 4,
      initialControl: {
        ...defaultControl,
        populationSize: env.TRAINER_POPULATION_SIZE,
        maxGenerations: env.TRAINER_GENERATIONS,
        timeBudgetMs: env.TRAINER_TIME_BUDGET_MS,
        episodesPerIndividual: env.TRAINER_EPISODES_PER_INDIVIDUAL,
      },
      onGeneration: (ctx: GenerationContext) => {
        this.generationContext = ctx;
        this.bestGenome = ctx.bestGenome;
        console.log(
          `[Trainer] Gen ${ctx.generation}: best=${ctx.bestFitness.toFixed(4)}, ` +
            `avg=${ctx.avgFitness.toFixed(4)}, archive=${ctx.archive.length}, ` +
            `stagnation=${ctx.stagnation}, elapsed=${(ctx.elapsedMs / 1000).toFixed(1)}s`
        );
      },
      onArchiveUpdate: (archive: DeepReadonly<LamarckGenome>[]) => {
        if (archive.length > 0) {
          this.bestGenome = archive[0];
        }
      },
    });

    try {
      const result = await this.runner.run();
      this.bestGenome = result;
      console.log(
        `[Trainer] Training complete for ${symbol}. ` +
          `Best fitness: ${(result.fitness ?? 0).toFixed(4)}`
      );
    } catch (err) {
      console.error(`[Trainer] Training failed for ${symbol}:`, err);
    } finally {
      this.training = false;
    }
  }

  getBestAgentSummary(): BestAgentSummary | null {
    if (!this.bestGenome) return null;

    const g = this.bestGenome;
    const meta = g.fitnessMeta;

    return {
      id: g.id,
      generation: g.generation,
      fitness: g.fitness ?? 0,
      sharpe: meta?.rawScores ? this.computeSharpe(meta.rawScores) : 0,
      avgPnl: meta?.rawScores
        ? ([...meta.rawScores] as number[]).reduce((s: number, v: number) => s + v, 0) /
          meta.rawScores.length
        : 0,
      negFlops: 0,
      complexityPenalty: 0,
      gaControl: {
        populationSize: g.gaControl.populationSize,
        elitismFraction: g.gaControl.elitismFraction,
        survivorFraction: g.gaControl.survivorFraction,
        episodesPerIndividual: g.gaControl.episodesPerIndividual,
        selectionType: g.gaControl.selectionType,
        fitnessType: g.gaControl.fitnessType,
      },
      network: {
        inputDim: g.network.inputDim,
        outputDim: g.network.outputDim,
        hiddenLayers: g.network.hiddenLayers.map((l: { neurons: number; activation: string }) => ({
          neurons: l.neurons,
          activation: l.activation,
        })),
      },
      rl: {
        gamma: g.rl.gamma,
        learningRate: g.rl.learningRate,
        epsilonStart: g.rl.discretePolicy.epsilonStart,
        epsilonMin: g.rl.discretePolicy.epsilonMin,
        epsilonDecay: g.rl.discretePolicy.epsilonDecay,
      },
    };
  }

  getGenerationContext(): GenerationContext | null {
    return this.generationContext;
  }

  private computeSharpe(scores: readonly number[]): number {
    if (scores.length < 2) return 0;
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const variance =
      scores.map(v => (v - mean) ** 2).reduce((s, v) => s + v, 0) / (scores.length - 1);
    const std = Math.sqrt(variance);
    return std < 1e-10 ? mean : mean / std;
  }
}
