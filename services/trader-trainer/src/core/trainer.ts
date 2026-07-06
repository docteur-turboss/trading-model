import { logger } from "@trading-model/common/config/logger";
import { env } from "../config/env";
import { createDefaultGenome } from "./genetic-algorithm/factory";
import {
	type GenerationContext,
	GeneticAlgorithmRunner,
	type WindowSet,
} from "./genetic-algorithm/ga-runner";
import { makeTradingAgentBackend } from "./genetic-algorithm/rl-backend";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type {
	ActivationType,
	FitnessType,
	SelectionType,
} from "./genetic-algorithm/genome";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import { type MarketDataBuffer } from "./market-data-buffer";
import { fromSymbol, type TradingSymbol, toSymbol } from "./market-data-types";
import { TrainingPrerequisiteValidator } from "./training-prerequisite-validator";
import { GenomeSummaryBuilder } from "./genome-summary-builder";

/** Summary of the best trained agent for API responses. */
export interface BestAgentSummary {
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
		selectionType: SelectionType;
		fitnessType: FitnessType;
	};
	network: {
		inputDim: number;
		outputDim: number;
		hiddenLayers: { neurons: number; activation: ActivationType }[];
	};
	rl: {
		gamma: number;
		learningRate: number;
		epsilonStart: number;
		epsilonMin: number;
		epsilonDecay: number;
	};
}

/** Indicates that training completed successfully with the resulting best genome. */
export interface TrainingSuccess {
	success: true;
	symbol: string;
	bestGenome: DeepReadonly<LamarckGenome>;
}

/** Indicates that training failed with an error. */
export interface TrainingFailure {
	success: false;
	symbol: string;
	error: Error;
}

/** Discriminated result of a training cycle. */
export type TrainingResult = TrainingSuccess | TrainingFailure;

/** Orchestrates GA training cycles: feeds market data, runs generations, tracks best genome. */
export class Trainer {
	private _runner: GeneticAlgorithmRunner | null = null;
	private _bestGenome: DeepReadonly<LamarckGenome> | null = null;
	private _training = false;
	private _generationContext: GenerationContext | null = null;
	private _currentSymbol: TradingSymbol = toSymbol("");

	private readonly _validator: TrainingPrerequisiteValidator;
	private readonly _summaryBuilder: GenomeSummaryBuilder;

	constructor(private readonly _dataBuffer: MarketDataBuffer) {
		this._validator = new TrainingPrerequisiteValidator(
			this._dataBuffer,
			() => this._training
		);
		this._summaryBuilder = new GenomeSummaryBuilder();
	}

	isTraining(): boolean {
		return this._training;
	}

	getCurrentSymbol(): string {
		return fromSymbol(this._currentSymbol);
	}

	getGeneration(): number {
		return this._runner?.getGeneration() ?? 0;
	}

	/**
	 * Run a full GA training cycle for the given symbol.
	 * Skips if already training or insufficient data.
	 *
	 * @param symbol - Market symbol to train on.
	 * @returns TrainingResult indicating success or failure.
	 */
	async train(symbol: string): Promise<TrainingResult> {
		const validation = this._validator.validate(symbol);
		if (!validation.ok) {
			return validation.error;
		}

		this._currentSymbol = toSymbol(symbol);
		this._training = true;
		this._runner = this._createRunner(validation.windowSet);

		try {
			return await this._runTraining(symbol);
		} catch (err) {
			return this._handleTrainingError(symbol, err);
		} finally {
			this._training = false;
		}
	}

	private async _runTraining(symbol: string): Promise<TrainingSuccess> {
		const result = await this._runner!.run();
		this._bestGenome = result;
		logger.info("Training complete", { context: { symbol, bestFitness: result.fitness ?? 0 } });
		return { success: true, symbol, bestGenome: result };
	}

	private _handleTrainingError(symbol: string, err: unknown): TrainingFailure {
		const error = err instanceof Error ? err : new Error(String(err));
		logger.error("Training failed", { context: { symbol, err: error.message } });
		return { success: false, symbol, error };
	}

	private _createRunner(windowSet: WindowSet): GeneticAlgorithmRunner {
		const defaultControl = createDefaultGenome("ctrl").gaControl;

		return new GeneticAlgorithmRunner({
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
				this._generationContext = ctx;
				this._bestGenome = ctx.bestGenome;
				logger.info("Generation completed", { context: {
					generation: ctx.generation,
					bestFitness: ctx.bestFitness,
					avgFitness: ctx.avgFitness,
					archiveSize: ctx.archive.length,
					stagnation: ctx.stagnation,
					elapsedSec: ctx.elapsedMs / 1000,
				} });
			},
			onArchiveUpdate: (archive: DeepReadonly<LamarckGenome>[]) => {
				if (archive.length > 0) {
					this._bestGenome = archive[0];
				}
			},
		});
	}

	getBestAgentSummary(): BestAgentSummary | null {
		if (!this._bestGenome) {
			return null;
		}

		return this._summaryBuilder.buildBestAgentSummary(this._bestGenome);
	}

	getGenerationContext(): GenerationContext | null {
		return this._generationContext;
	}

	private _computeSharpe(scores: readonly number[]): number {
		return GenomeSummaryBuilder.computeSharpe(scores);
	}
}
