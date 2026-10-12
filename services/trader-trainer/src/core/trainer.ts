import type {
	Fitness,
	PositiveInt,
} from "@trading-model/common/domain/primitives";
import { logger } from "@trading-model/http/infrastructure/logger";
import {
	BEST_FITNESS,
	TRAINING_DURATION_SECONDS,
	TRAINING_SESSIONS_TOTAL,
	TRAINING_STATUS,
} from "../config/metrics";
import type { GenerationContext } from "./genetic-algorithm/ga-runner";
import { computeSharpe } from "./genome-summary-builder";
import type { MarketDataBuffer } from "./market-data-buffer";
import type { TradingSymbol } from "./market-data-types";
import type { ModelPublisher } from "./model-publisher";
import { validateTrainingPrerequisites } from "./training-prerequisite-validator";
import {
	TrainingSession,
	type TrainingSessionResult,
} from "./training-session";
import {
	type BestAgentSummary,
	LastTrainingInfo,
	NullLastTrainingInfo,
	type TrainingSnapshot,
} from "./training-state";
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
	private _lastInfo: TrainingSnapshot = new NullLastTrainingInfo();
	private readonly _symbolSnapshots = new Map<
		TradingSymbol,
		TrainingSnapshot
	>();

	constructor(
		private readonly _dataBuffer: MarketDataBuffer,
		private readonly _publisher?: ModelPublisher
	) {}

	isTraining(): boolean {
		return this._status === TrainerStatus.Training;
	}

	getCurrentSymbol(): TradingSymbol {
		return this._lastInfo.symbol;
	}

	getGeneration(): number {
		return this._lastInfo.generation;
	}

	getAllSnapshots(): Map<TradingSymbol, TrainingSnapshot> {
		return this._symbolSnapshots;
	}

	getSnapshotForSymbol(symbol: TradingSymbol): TrainingSnapshot | undefined {
		return this._symbolSnapshots.get(symbol);
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
		TRAINING_STATUS.set(1);
		const start = performance.now();

		try {
			const result = await this._runSession(symbol, validation.windowSets);
			TRAINING_SESSIONS_TOTAL.inc({ result: "success" });
			BEST_FITNESS.set({ symbol: String(symbol) }, result.bestFitness);
			await this._publishModel(symbol);
			return result;
		} catch (err) {
			TRAINING_SESSIONS_TOTAL.inc({ result: "fail" });
			return this._handleTrainingError(symbol, err);
		} finally {
			const duration = (performance.now() - start) / 1000;
			TRAINING_DURATION_SECONDS.observe(duration);
			TRAINING_STATUS.set(0);
			this._status = TrainerStatus.Idle;
		}
	}

	private async _runSession(
		symbol: TradingSymbol,
		windowSets: import("./genetic-algorithm/ga-runner").WindowSet[]
	): Promise<TrainingSuccess> {
		const session = new TrainingSession(windowSets);
		const result: TrainingSessionResult = await session.run();
		const snapshot = new LastTrainingInfo({
			symbol,
			bestGenome: result.bestGenome,
			bestFitness: result.bestFitness as unknown as Fitness,
			bestFitnessMeta: result.bestFitnessMeta,
			generation: result.generation as unknown as PositiveInt,
			generationContext: result.generationContext,
		});
		this._lastInfo = snapshot;
		this._symbolSnapshots.set(symbol, snapshot);
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

	private async _publishModel(symbol: TradingSymbol): Promise<void> {
		if (!this._publisher) {
			return;
		}
		const summary = this._lastInfo.buildBestAgentSummary();
		if (!summary) {
			return;
		}
		try {
			await this._publisher.publish(symbol, summary);
			logger.info("Model published", {
				context: { symbol, agentId: summary.id },
			});
		} catch (err) {
			logger.error("Failed to publish model", {
				context: {
					symbol,
					err: err instanceof Error ? err.message : String(err),
				},
			});
		}
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
		return this._lastInfo.buildBestAgentSummary();
	}

	getGenerationContext(): GenerationContext | null {
		return this._lastInfo.generationContext;
	}

	_computeSharpe(scores: number[]): number {
		return computeSharpe(scores);
	}
}
