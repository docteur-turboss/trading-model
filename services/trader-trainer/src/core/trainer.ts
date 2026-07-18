import { logger } from "@trading-model/common/config/logger";
import type {
	Fitness,
	PositiveInt,
} from "@trading-model/common/domain/primitives";
import { EpisodeScores } from "./genetic-algorithm/episode-scores";
import type { GenerationContext } from "./genetic-algorithm/ga-runner";
import type { MarketDataBuffer } from "./market-data-buffer";
import type { TradingSymbol } from "./market-data-types";
import { validateTrainingPrerequisites } from "./training-prerequisite-validator";
import {
	TrainingSession,
	type TrainingSessionResult,
} from "./training-session";
import { type BestAgentSummary, LastTrainingInfo } from "./training-state";
import type {
	TrainingFailure,
	TrainingResult,
	TrainingSuccess,
} from "./training-types";

export type { BestAgentSummary };

enum TrainerStatus {
	Idle = "idle",
	Training = "training",
}

/** Orchestrates GA training cycles: feeds market data, runs generations, tracks best genome. */
export class Trainer {
	private _status: TrainerStatus = TrainerStatus.Idle;
	private _lastInfo: LastTrainingInfo | null = null;
	constructor(private readonly _dataBuffer: MarketDataBuffer) {}

	isTraining(): boolean {
		return this._status === TrainerStatus.Training;
	}

	getCurrentSymbol(): TradingSymbol {
		return this._lastInfo?.symbol ?? ("" as TradingSymbol);
	}

	getGeneration(): number {
		return this._lastInfo?.generation ?? 0;
	}

	async train(symbol: TradingSymbol): Promise<TrainingResult> {
		const validation = validateTrainingPrerequisites(
			this._dataBuffer,
			() => this._status === TrainerStatus.Training,
			symbol
		);
		if (!validation.ok) {
			return validation.error;
		}

		this._status = TrainerStatus.Training;

		try {
			return await this._runSession(symbol, validation.windowSet);
		} catch (err) {
			return this._handleTrainingError(symbol, err);
		} finally {
			this._status = TrainerStatus.Idle;
		}
	}

	private async _runSession(
		symbol: TradingSymbol,
		windowSet: import("./genetic-algorithm/ga-runner").WindowSet
	): Promise<TrainingSuccess> {
		const session = new TrainingSession(windowSet);
		const result: TrainingSessionResult = await session.run();
		this._lastInfo = new LastTrainingInfo(
			symbol,
			result.bestGenome,
			result.bestFitness as unknown as Fitness,
			result.bestFitnessMeta,
			result.generation as unknown as PositiveInt,
			result.generationContext
		);
		logger.info("Training complete", {
			context: { symbol, bestFitness: result.bestFitness },
		});
		return {
			success: true,
			symbol,
			bestGenome: result.bestGenome,
			bestFitness: result.bestFitness as unknown as Fitness,
			bestFitnessMeta: result.bestFitnessMeta,
			generation: result.generation as unknown as PositiveInt,
			generationContext: result.generationContext,
		};
	}

	private _handleTrainingError(
		symbol: TradingSymbol,
		err: unknown
	): TrainingFailure {
		const error = err instanceof Error ? err : new Error(String(err));
		logger.error("Training failed", {
			context: { symbol, err: error.message },
		});
		return { success: false, symbol, error };
	}

	getBestAgentSummary(): BestAgentSummary | null {
		if (!this._lastInfo) {
			return null;
		}
		return this._lastInfo.buildBestAgentSummary();
	}

	getGenerationContext(): GenerationContext | null {
		return this._lastInfo?.generationContext ?? null;
	}

	_computeSharpe(scores: number[]): number {
		return new EpisodeScores(scores).sharpe();
	}
}
