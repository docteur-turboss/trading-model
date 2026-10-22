import { getLogger } from "@trading-model/contracts/logger-registry";
import type {
	Fitness,
	PositiveInt,
} from "@trading-model/primitives/primitives";
import {
	BEST_FITNESS,
	TRAINING_DURATION_SECONDS,
	TRAINING_SESSIONS_TOTAL,
	TRAINING_STATUS,
} from "../config/metrics";
import type { GenerationContext } from "../domain/genetic-algorithm/ga-runner";
import type { GaTelemetry } from "../domain/genetic-algorithm/ga-telemetry";
import { computeSharpe } from "../domain/genome-summary-builder";
import type { MarketDataBuffer } from "../domain/market-data-buffer";
import type { TradingSymbol } from "../domain/market-data-types";
import type { ModelPublisherPort } from "../domain/ports/model-publisher.port";
import { validateTrainingPrerequisites } from "../domain/training-prerequisite-validator";
import type { TrainingSettings } from "../domain/training-settings";
import {
	type BestAgentSummary,
	LastTrainingInfo,
	NullLastTrainingInfo,
	type TrainingSnapshot,
} from "../domain/training-state";
import type {
	TrainingFailure,
	TrainingResult,
	TrainingSuccess,
} from "../domain/training-types";
import {
	TrainingSession,
	type TrainingSessionResult,
} from "./training-session";

export type { BestAgentSummary };

export interface TrainerDeps {
	settings: TrainingSettings;
	publisher?: ModelPublisherPort;
	telemetry?: GaTelemetry;
}

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

	private readonly _publisher?: ModelPublisherPort;

	constructor(
		private readonly _dataBuffer: MarketDataBuffer,
		private readonly _deps: TrainerDeps
	) {
		this._publisher = _deps.publisher;
	}

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
			symbol,
			this._deps.settings
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
		windowSets: import("../domain/genetic-algorithm/ga-runner").WindowSet[]
	): Promise<TrainingSuccess> {
		const session = new TrainingSession(
			windowSets,
			this._deps.settings,
			this._deps.telemetry
		);
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
		getLogger().info("Training complete", {
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
			getLogger().info("Model published", {
				context: { symbol, agentId: summary.id },
			});
		} catch (err) {
			getLogger().error("Failed to publish model", {
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
		getLogger().error("Training failed", {
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
