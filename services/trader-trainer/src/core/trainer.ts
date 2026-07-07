import { logger } from "@trading-model/common/config/logger";
import type { GenerationContext } from "./genetic-algorithm/ga-runner";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import { GenomeSummaryBuilder } from "./genome-summary-builder";
import type { MarketDataBuffer } from "./market-data-buffer";
import type { TradingSymbol } from "./market-data-types";
import { TrainingPrerequisiteValidator } from "./training-prerequisite-validator";
import {
	TrainingSession,
	type TrainingSessionResult,
} from "./training-session";
import {
	buildBestAgentSummary,
	type BestAgentSummary,
	type LastTrainingInfo,
} from "./training-state";

export type { BestAgentSummary };

/** Indicates that training completed successfully with the resulting best genome. */
export interface TrainingSuccess {
	success: true;
	symbol: TradingSymbol;
	bestGenome: DeepReadonly<LamarckGenome>;
}

/** Indicates that training failed with an error. */
export interface TrainingFailure {
	success: false;
	symbol: TradingSymbol;
	error: Error;
}

/** Discriminated result of a training cycle. */
export type TrainingResult = TrainingSuccess | TrainingFailure;

type TrainerStatus = "idle" | "training";

/** Orchestrates GA training cycles: feeds market data, runs generations, tracks best genome. */
export class Trainer {
	private _status: TrainerStatus = "idle";
	private _lastInfo: LastTrainingInfo | null = null;
	private readonly _summaryBuilder = new GenomeSummaryBuilder();
	private readonly _validator: TrainingPrerequisiteValidator;

	constructor(private readonly _dataBuffer: MarketDataBuffer	) {
		this._validator = new TrainingPrerequisiteValidator(
			this._dataBuffer,
			() => this._status === "training" as const
		);
	}

	isTraining(): boolean {
		return this._status === "training";
	}

	getCurrentSymbol(): TradingSymbol | undefined {
		return this._lastInfo?.symbol;
	}

	getGeneration(): number | undefined {
		return this._lastInfo?.generation;
	}

	async train(symbol: TradingSymbol): Promise<TrainingResult> {
		const validation = this._validator.validate(symbol);
		if (!validation.ok) {
			return validation.error;
		}

		this._status = "training";

		try {
			return await this._runSession(symbol, validation.windowSet);
		} catch (err) {
			return this._handleTrainingError(symbol, err);
		} finally {
			this._status = "idle";
		}
	}

	private async _runSession(symbol: TradingSymbol, windowSet: import("./genetic-algorithm/ga-runner").WindowSet): Promise<TrainingSuccess> {
		const session = new TrainingSession(windowSet);
		const result: TrainingSessionResult = await session.run();
		this._lastInfo = {
			symbol,
			bestGenome: result.bestGenome,
			bestFitness: result.bestFitness,
			bestFitnessMeta: result.bestFitnessMeta,
			generation: result.generation,
			generationContext: result.generationContext,
		};
		logger.info("Training complete", {
			context: { symbol, bestFitness: result.bestFitness },
		});
		return { success: true, symbol, bestGenome: result.bestGenome };
	}

	private _handleTrainingError(symbol: TradingSymbol, err: unknown): TrainingFailure {
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
		return buildBestAgentSummary(this._lastInfo, this._summaryBuilder);
	}

	getGenerationContext(): GenerationContext | null | undefined {
		return this._lastInfo?.generationContext;
	}

	// biome-ignore lint/correctness/noUnusedPrivateClassMembers
	private _computeSharpe(scores: readonly number[]): number {
		return GenomeSummaryBuilder.computeSharpe(scores);
	}
}
