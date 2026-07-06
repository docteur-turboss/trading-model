import { logger } from "@trading-model/common/config/logger";
import type { GenerationContext } from "./genetic-algorithm/ga-runner";
import type {
	ActivationType,
	FitnessType,
	SelectionType,
} from "./genetic-algorithm/genome";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import { GenomeSummaryBuilder } from "./genome-summary-builder";
import type { MarketDataBuffer } from "./market-data-buffer";
import { TrainingPrerequisiteValidator } from "./training-prerequisite-validator";
import {
	TrainingSession,
	type TrainingSessionResult,
} from "./training-session";

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

interface LastTrainingInfo {
	symbol: string;
	bestGenome: DeepReadonly<LamarckGenome>;
	generation: number;
	generationContext: GenerationContext | null;
}

/** Orchestrates GA training cycles: feeds market data, runs generations, tracks best genome. */
export class Trainer {
	private _training = false;
	private _lastInfo: LastTrainingInfo | null = null;

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
		return this._lastInfo?.symbol ?? "";
	}

	getGeneration(): number {
		return this._lastInfo?.generation ?? 0;
	}

	async train(symbol: string): Promise<TrainingResult> {
		const validation = this._validator.validate(symbol);
		if (!validation.ok) {
			return validation.error;
		}

		this._training = true;
		const session = new TrainingSession(validation.windowSet);

		try {
			const result: TrainingSessionResult = await session.run();
			this._lastInfo = {
				symbol,
				bestGenome: result.bestGenome,
				generation: result.generation,
				generationContext: result.generationContext,
			};
			logger.info("Training complete", {
				context: { symbol, bestFitness: result.bestGenome.fitness ?? 0 },
			});
			return { success: true, symbol, bestGenome: result.bestGenome };
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			logger.error("Training failed", {
				context: { symbol, err: error.message },
			});
			return { success: false, symbol, error };
		} finally {
			this._training = false;
		}
	}

	getBestAgentSummary(): BestAgentSummary | null {
		if (!this._lastInfo) {
			return null;
		}

		return this._summaryBuilder.buildBestAgentSummary(
			this._lastInfo.bestGenome
		);
	}

	getGenerationContext(): GenerationContext | null {
		return this._lastInfo?.generationContext ?? null;
	}

	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: Accessed via prototype in tests
	private _computeSharpe(scores: readonly number[]): number {
		return GenomeSummaryBuilder.computeSharpe(scores);
	}
}
