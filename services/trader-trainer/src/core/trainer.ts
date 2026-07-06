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
import { type BestAgentSummary, TrainingState } from "./training-state";

export { TrainingState } from "./training-state";
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

/** Orchestrates GA training cycles: feeds market data, runs generations, tracks best genome. */
export class Trainer {
	private _status: "idle" | "training" = "idle";
	private readonly _trainingState = new TrainingState();
	private readonly _validator: TrainingPrerequisiteValidator;

	constructor(private readonly _dataBuffer: MarketDataBuffer) {
		this._validator = new TrainingPrerequisiteValidator(
			this._dataBuffer,
			() => this._status === "training"
		);
	}

	isTraining(): boolean {
		return this._status === "training";
	}

	getCurrentSymbol(): TradingSymbol | undefined {
		return this._trainingState.getCurrentSymbol();
	}

	getGeneration(): number | undefined {
		return this._trainingState.getGeneration();
	}

	async train(symbol: TradingSymbol): Promise<TrainingResult> {
		const validation = this._validator.validate(symbol);
		if (!validation.ok) {
			return validation.error;
		}

		this._status = "training";
		const session = new TrainingSession(validation.windowSet);

		try {
			const result: TrainingSessionResult = await session.run();
			this._trainingState.update({
				symbol,
				bestGenome: result.bestGenome,
				generation: result.generation,
				generationContext: result.generationContext,
			});
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
			this._status = "idle";
		}
	}

	getBestAgentSummary(): BestAgentSummary | null {
		return this._trainingState.getBestAgentSummary();
	}

	getGenerationContext(): GenerationContext | null | undefined {
		return this._trainingState.getGenerationContext();
	}

	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: Accessed via prototype in tests
	private _computeSharpe(scores: readonly number[]): number {
		return GenomeSummaryBuilder.computeSharpe(scores);
	}
}
