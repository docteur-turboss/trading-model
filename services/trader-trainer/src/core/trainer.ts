import { logger } from '@trading-model/common/config/logger';

import { createDefaultGenome } from './genetic-algorithm/factory';
import {
  GeneticAlgorithmRunner,
  makeTradingAgentBackend,
  GenerationContext,
} from './genetic-algorithm/ga-runner';
import { LamarckGenome } from './genetic-algorithm/genome-types';
import { DeepReadonly } from './genetic-algorithm/shared-types';
import { MarketDataBuffer, MIN_TRAINING_STEPS } from './market-data-buffer';
import { NormalizationStats, TradingSymbol, toSymbol, fromSymbol } from './market-data-types';
import { env } from '../config/env';

/** Summary of the best trained agent for API responses. */
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

/** Indicates that training completed successfully with the resulting best genome. */
export type TrainingSuccess = {
  success: true;
  symbol: string;
  bestGenome: DeepReadonly<LamarckGenome>;
};

/** Indicates that training failed with an error. */
export type TrainingFailure = {
  success: false;
  symbol: string;
  error: Error;
};

/** Discriminated result of a training cycle. */
export type TrainingResult = TrainingSuccess | TrainingFailure;

/** Orchestrates GA training cycles: feeds market data, runs generations, tracks best genome. */
export class Trainer {
  private runner: GeneticAlgorithmRunner | null = null;
  private bestGenome: DeepReadonly<LamarckGenome> | null = null;
  private training = false;
  private generationContext: GenerationContext | null = null;
  private currentSymbol: TradingSymbol = toSymbol('');

  constructor(private readonly dataBuffer: MarketDataBuffer) {}

  /** Return whether a training cycle is currently in progress. */
  isTraining(): boolean {
    return this.training;
  }

  /** Return the symbol currently being trained on. */
  getCurrentSymbol(): string {
    return fromSymbol(this.currentSymbol);
  }

  /** Return the current generation number (0 if not started). */
  getGeneration(): number {
    return this.runner?.getGeneration() ?? 0;
  }

  /**
   * Run a full GA training cycle for the given symbol.
   * Skips if already training or insufficient data.
   *
   * @param symbol - Market symbol to train on.
   * @returns TrainingResult indicating success or failure.
   */
  async train(symbol: string): Promise<TrainingResult> {
    if (this.training) return { success: false, symbol, error: new Error('Already training') };

    const windowSet = this.dataBuffer.getAllWindows(symbol, env.TRAINER_VALIDATION_SPLIT);

    if (!windowSet || windowSet.train.length < MIN_TRAINING_STEPS) {
      return {
        success: false,
        symbol,
        error: new Error(
          `Not enough data for ${symbol}, need at least ${MIN_TRAINING_STEPS} steps`
        ),
      };
    }

    this.currentSymbol = toSymbol(symbol);
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
        logger.info(
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
      logger.info(
        `[Trainer] Training complete for ${symbol}. ` +
          `Best fitness: ${(result.fitness ?? 0).toFixed(4)}`
      );
      return { success: true, symbol, bestGenome: result };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`[Trainer] Training failed for ${symbol}:`, { err: error.message });
      return { success: false, symbol, error };
    } finally {
      this.training = false;
    }
  }

  /** Build a serialisable summary of the best genome for API consumption. Returns null if no genome exists. */
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
