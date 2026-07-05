import { logger } from "@trading-model/common/config/logger";
import { env } from "../config/env";
import { createDefaultGenome } from "./genetic-algorithm/factory";
import {
	type GenerationContext,
	GeneticAlgorithmRunner,
	makeTradingAgentBackend,
	type WindowSet,
} from "./genetic-algorithm/ga-runner";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type {
	ActivationType,
	FitnessType,
	SelectionType,
} from "./genetic-algorithm/genome";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import {
	type MarketDataBuffer,
	MIN_TRAINING_STEPS,
} from "./market-data-buffer";
import { fromSymbol, type TradingSymbol, toSymbol } from "./market-data-types";

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

	constructor(private readonly _dataBuffer: MarketDataBuffer) {}

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
		const validation = this._validateTrainingPrerequisites(symbol);
		if (!validation.ok) {
			return validation.error;
		}

		this._currentSymbol = toSymbol(symbol);
		this._training = true;
		this._runner = this._createRunner(validation.windowSet);

		try {
			const result = await this._runner.run();
			this._bestGenome = result;
			logger.info("Training complete", {
				symbol,
				bestFitness: result.fitness ?? 0,
			});
			return { success: true, symbol, bestGenome: result };
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			logger.error("Training failed", { symbol, err: error.message });
			return { success: false, symbol, error };
		} finally {
			this._training = false;
		}
	}

	private _validateTrainingPrerequisites(
		symbol: string
	):
		| { ok: true; windowSet: WindowSet }
		| { ok: false; error: TrainingFailure } {
		if (this._training) {
			return {
				ok: false,
				error: { success: false, symbol, error: new Error("Already training") },
			};
		}

		const windowSet = this._dataBuffer.getAllWindows(
			symbol,
			env.TRAINER_VALIDATION_SPLIT
		);
		if (!windowSet || windowSet.train.length < MIN_TRAINING_STEPS) {
			return {
				ok: false,
				error: {
					success: false,
					symbol,
					error: new Error(
						`Not enough data for ${symbol}, need at least ${MIN_TRAINING_STEPS} steps`
					),
				},
			};
		}

		return { ok: true, windowSet };
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
				logger.info("Generation completed", {
					generation: ctx.generation,
					bestFitness: ctx.bestFitness,
					avgFitness: ctx.avgFitness,
					archiveSize: ctx.archive.length,
					stagnation: ctx.stagnation,
					elapsedSec: ctx.elapsedMs / 1000,
				});
			},
			onArchiveUpdate: (archive: DeepReadonly<LamarckGenome>[]) => {
				if (archive.length > 0) {
					this._bestGenome = archive[0];
				}
			},
		});
	}

	/** Build a serialisable summary of the best genome for API consumption. Returns null if no genome exists. */
	private _buildGASummary(
		genome: DeepReadonly<LamarckGenome>
	): BestAgentSummary["gaControl"] {
		return {
			populationSize: genome.gaControl.populationSize,
			elitismFraction: genome.gaControl.elitismFraction,
			survivorFraction: genome.gaControl.survivorFraction,
			episodesPerIndividual: genome.gaControl.episodesPerIndividual,
			selectionType: genome.gaControl.selectionType,
			fitnessType: genome.gaControl.fitnessType,
		};
	}

	private _buildNetworkSummary(
		genome: DeepReadonly<LamarckGenome>
	): BestAgentSummary["network"] {
		return {
			inputDim: genome.network.inputDim,
			outputDim: genome.network.outputDim,
			hiddenLayers: genome.network.hiddenLayers.map(
				(layer: { neurons: number; activation: ActivationType }) => ({
					neurons: layer.neurons,
					activation: layer.activation,
				})
			),
		};
	}

	private _buildRLSummary(
		genome: DeepReadonly<LamarckGenome>
	): BestAgentSummary["rl"] {
		return {
			gamma: genome.rl.gamma,
			learningRate: genome.rl.learningRate,
			epsilonStart: genome.rl.discretePolicy.epsilonStart,
			epsilonMin: genome.rl.discretePolicy.epsilonMin,
			epsilonDecay: genome.rl.discretePolicy.epsilonDecay,
		};
	}

	private _computeAvgPnl(rawScores: readonly number[]): number {
		return (
			([...rawScores] as number[]).reduce(
				(sum: number, val: number) => sum + val,
				0
			) / rawScores.length
		);
	}

	getBestAgentSummary(): BestAgentSummary | null {
		if (!this._bestGenome) {
			return null;
		}

		const genome = this._bestGenome;
		const meta = genome.fitnessMeta;

		return {
			id: genome.id,
			generation: genome.generation,
			fitness: genome.fitness ?? 0,
			sharpe: meta?.rawScores ? this._computeSharpe(meta.rawScores) : 0,
			avgPnl: meta?.rawScores ? this._computeAvgPnl(meta.rawScores) : 0,
			negFlops: 0,
			complexityPenalty: 0,
			gaControl: this._buildGASummary(genome),
			network: this._buildNetworkSummary(genome),
			rl: this._buildRLSummary(genome),
		};
	}

	getGenerationContext(): GenerationContext | null {
		return this._generationContext;
	}

	private _computeSharpe(scores: readonly number[]): number {
		if (scores.length < 2) {
			return 0;
		}
		const mean = scores.reduce((sum, val) => sum + val, 0) / scores.length;
		const variance =
			scores
				.map((val) => (val - mean) ** 2)
				.reduce((sum, val) => sum + val, 0) /
			(scores.length - 1);
		const std = Math.sqrt(variance);
		return std < 1e-10 ? mean : mean / std;
	}
}
