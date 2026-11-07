import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type {
	Fitness,
	PositiveInt,
} from "@trading-model/primitives/primitives";
import {
	BEST_FITNESS,
	MODEL_ARTIFACTS_TOTAL,
	TRAINING_DURATION_SECONDS,
	TRAINING_SESSIONS_TOTAL,
	TRAINING_STATUS,
} from "../config/metrics";
import { NETWORK_INPUT_LAYOUT } from "../domain/agent/agent-state";
import type { GenerationContext } from "../domain/genetic-algorithm/ga-runner";
import type { GaTelemetry } from "../domain/genetic-algorithm/ga-telemetry";
import type { MarketDataBuffer } from "../domain/market-data-buffer";
import type { TradingSymbol } from "../domain/market-data-types";
import type { ModelArtifactStorePort } from "../domain/ports/model-artifact-store.port";
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
	runInProcess,
	type TrainingRunner,
	type TrainingSessionResult,
} from "./training-session";

export type { BestAgentSummary };

export interface TrainerDeps {
	settings: TrainingSettings;
	publisher?: ModelPublisherPort;
	telemetry?: GaTelemetry;
	/** Keeps the best agent of each training as a versioned artifact (ADR-0022). */
	models?: ModelArtifactStorePort;
	/** Instance written in the artifacts it produces. */
	instanceId?: string;
	/** Where the session runs; default: the calling thread. */
	runner?: TrainingRunner;
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

	constructor(
		private readonly _dataBuffer: MarketDataBuffer,
		private readonly _deps: TrainerDeps
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
			BEST_FITNESS.set({ symbol }, result.bestFitness);
			await this._storeModel(result);
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
		const run: TrainingRunner = this._deps.runner ?? runInProcess;
		const result: TrainingSessionResult = await run(
			windowSets,
			this._deps.settings,
			this._deps.telemetry
		);
		const outcome = {
			symbol,
			bestGenome: result.bestGenome,
			bestFitness: result.bestFitness as unknown as Fitness,
			bestFitnessMeta: result.bestFitnessMeta,
			generation: result.generation as unknown as PositiveInt,
			generationContext: result.generationContext,
		};
		const snapshot = new LastTrainingInfo(outcome);
		this._lastInfo = snapshot;
		this._symbolSnapshots.set(symbol, snapshot);
		getLogger().info("Training complete", {
			context: { symbol, bestFitness: result.bestFitness },
		});
		return { success: true, ...outcome };
	}

	/**
	 * Writes the best agent as a versioned artifact. A failed write is logged
	 * and counted: the training itself succeeded, its result stays usable.
	 */
	private async _storeModel(result: TrainingSuccess): Promise<void> {
		const models = this._deps.models;
		if (!models) {
			return;
		}
		const summary = this._lastInfo.buildBestAgentSummary();
		const weights = result.bestGenome.trainedWeights;
		if (!(summary && weights)) {
			MODEL_ARTIFACTS_TOTAL.inc({ result: "skipped" });
			getLogger().warn(
				"Model not stored: the best genome has no trained weights",
				{
					context: { symbol: result.symbol },
				}
			);
			return;
		}
		try {
			const stored = await models.save({
				symbol: result.symbol,
				instanceId: this._deps.instanceId ?? "trader-trainer",
				bestGenome: result.bestGenome,
				weights: new Float32Array(weights),
				features: NETWORK_INPUT_LAYOUT,
				normalization: this._dataBuffer.snapshotNormalization(result.symbol),
				summary,
			});
			MODEL_ARTIFACTS_TOTAL.inc({ result: "stored" });
			getLogger().info("Model stored", {
				context: { symbol: result.symbol, version: stored.version },
			});
		} catch (err) {
			MODEL_ARTIFACTS_TOTAL.inc({ result: "error" });
			getLogger().error("Failed to store model artifact", {
				context: {
					symbol: result.symbol,
					err: normalizeError(err).message,
				},
			});
		}
	}

	private async _publishModel(symbol: TradingSymbol): Promise<void> {
		const publisher = this._deps.publisher;
		if (!publisher) {
			return;
		}
		const summary = this._lastInfo.buildBestAgentSummary();
		if (!summary) {
			return;
		}
		try {
			await publisher.publish(symbol, summary);
			getLogger().info("Model published", {
				context: { symbol, agentId: summary.id },
			});
		} catch (err) {
			getLogger().error("Failed to publish model", {
				context: {
					symbol,
					err: normalizeError(err).message,
				},
			});
		}
	}

	private _handleTrainingError(
		symbol: TradingSymbol,
		err: unknown
	): TrainingFailure {
		const error = normalizeError(err);
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
}
