import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { Fitness, NonNegativeInt } from "@trading-model/primitives/primitives";
import {
	BEST_FITNESS,
	FEATURE_DRIFT_SCORE,
	MODEL_ARTIFACTS_TOTAL,
	MODEL_BELOW_BUY_AND_HOLD_STREAK,
	MODEL_BUY_AND_HOLD_SHARPE,
	MODEL_MAX_DRAWDOWN,
	MODEL_RETURN,
	MODEL_SHARPE,
	TRAINING_DURATION_SECONDS,
	TRAINING_SESSIONS_TOTAL,
	TRAINING_STATUS,
} from "../config/metrics";
import { NETWORK_INPUT_LAYOUT } from "../domain/agent/agent-state";
import { featureDriftScore } from "../domain/feature-drift";
import { buyAndHoldSharpe } from "../domain/genetic-algorithm/evaluation-utils";
import type {
	GenerationContext,
	WindowSet,
} from "../domain/genetic-algorithm/ga-runner";
import type { GaTelemetry } from "../domain/genetic-algorithm/ga-telemetry";
import { summaryFromManifest } from "../domain/genome-summary-builder";
import type { MarketDataBuffer } from "../domain/market-data-buffer";
import type { TradingSymbol } from "../domain/market-data-types";
import type { ModelArtifactStorePort } from "../domain/ports/model-artifact-store.port";
import type { ModelPublisherPort } from "../domain/ports/model-publisher.port";
import { validateTrainingPrerequisites } from "../domain/training-prerequisite-validator";
import type { TrainingSettings } from "../domain/training-settings";
import {
	ArtifactTrainingInfo,
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

interface TrainerDeps {
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
	/** Normalization of the newest stored model of each symbol: drift baseline. */
	private readonly _lastModels = new Map<
		TradingSymbol,
		{ createdAt: number; normalization: Record<string, unknown> }
	>();
	private readonly _belowBuyAndHold = new Map<TradingSymbol, number>();
	/** The session in flight, and how to end it early (ADR-0058). */
	private _session?: { abort: AbortController; done: Promise<TrainingResult> };

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

	/**
	 * Serves the newest stored agent of each symbol until a training replaces
	 * it. An unreadable manifest is logged and skipped (startup goes on).
	 */
	async rehydrate(symbols: readonly TradingSymbol[]): Promise<void> {
		const models = this._deps.models;
		if (!models) {
			return;
		}
		for (const symbol of symbols) {
			try {
				const latest = (await models.list(String(symbol)))[0];
				const manifest =
					latest && (await models.manifest(String(symbol), latest.version));
				if (manifest && !this._lastModels.has(symbol)) {
					this._lastModels.set(symbol, {
						createdAt: Date.parse(manifest.createdAt),
						normalization: manifest.normalization,
					});
				}
				if (manifest && !this._symbolSnapshots.has(symbol)) {
					const snapshot = new ArtifactTrainingInfo(
						String(symbol),
						summaryFromManifest(manifest)
					);
					this._symbolSnapshots.set(symbol, snapshot);
					// /best-agent reads the last snapshot: serve the first one until a training.
					if (this._lastInfo instanceof NullLastTrainingInfo) {
						this._lastInfo = snapshot;
					}
					getLogger().info("Best agent rehydrated", {
						context: { symbol, version: manifest.version },
					});
				}
			} catch (err) {
				getLogger().error("Cannot rehydrate the best agent from its manifest", {
					context: { symbol, err: normalizeError(err).message },
				});
			}
		}
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
		this._reportFeatureDrift(symbol);
		const abort = new AbortController();
		const done = this._train(symbol, validation.windowSets, abort.signal);
		this._session = { abort, done };
		return await done;
	}

	/**
	 * Ends the session in flight after its current generation; resolves once
	 * its best agent is stored and published (at once when idle). ADR-0058:
	 * the trainer that hands over its Lease keeps the work done so far.
	 */
	async stopTraining(): Promise<void> {
		const session = this._session;
		if (!session) {
			return;
		}
		session.abort.abort();
		await session.done;
	}

	private async _train(
		symbol: TradingSymbol,
		windowSets: WindowSet[],
		signal: AbortSignal
	): Promise<TrainingResult> {
		this._status = TrainerStatus.Training;
		TRAINING_STATUS.set(1);
		const start = performance.now();

		try {
			const result = await this._runSession(symbol, windowSets, signal);
			TRAINING_SESSIONS_TOTAL.inc({ result: "success" });
			BEST_FITNESS.set({ symbol }, result.bestFitness);
			await this._storeModel(result, windowSets);
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
			this._session = undefined;
		}
	}

	private async _runSession(
		symbol: TradingSymbol,
		windowSets: WindowSet[],
		signal: AbortSignal
	): Promise<TrainingSuccess> {
		const run: TrainingRunner = this._deps.runner ?? runInProcess;
		const result: TrainingSessionResult = await run(
			windowSets,
			this._deps.settings,
			this._deps.telemetry,
			signal
		);
		const outcome = {
			symbol,
			bestGenome: result.bestGenome,
			bestFitness: Fitness.of(result.bestFitness),
			bestFitnessMeta: result.bestFitnessMeta,
			generation: NonNegativeInt.of(result.generation),
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
	private async _storeModel(
		result: TrainingSuccess,
		windowSets: WindowSet[]
	): Promise<void> {
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
		const normalization = this._dataBuffer.snapshotNormalization(result.symbol);
		try {
			const stored = await models.save({
				symbol: result.symbol,
				instanceId: this._deps.instanceId ?? "trader-trainer",
				bestGenome: result.bestGenome,
				weights: new Float32Array(weights),
				features: NETWORK_INPUT_LAYOUT,
				normalization,
				summary,
			});
			MODEL_ARTIFACTS_TOTAL.inc({ result: "stored" });
			this._lastModels.set(result.symbol, {
				createdAt: Date.parse(stored.createdAt),
				normalization,
			});
			this._reportModelPerformance(result.symbol, summary, windowSets);
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

	/** Out-of-sample metrics of a stored model next to buy and hold on its bars. */
	private _reportModelPerformance(
		symbol: TradingSymbol,
		summary: BestAgentSummary,
		windowSets: WindowSet[]
	): void {
		const labels = { symbol, segment: "validation" };
		const baseline = buyAndHoldSharpe(windowSets);
		MODEL_SHARPE.set(labels, summary.sharpe);
		MODEL_RETURN.set(labels, summary.avgPnl);
		MODEL_MAX_DRAWDOWN.set(labels, summary.maxDrawdown);
		MODEL_BUY_AND_HOLD_SHARPE.set(labels, baseline);
		const streak =
			summary.sharpe < baseline
				? (this._belowBuyAndHold.get(symbol) ?? 0) + 1
				: 0;
		this._belowBuyAndHold.set(symbol, streak);
		MODEL_BELOW_BUY_AND_HOLD_STREAK.set({ symbol }, streak);
	}

	/** Drift of the data received since the newest stored model, before a session. */
	private _reportFeatureDrift(symbol: TradingSymbol): void {
		const model = this._lastModels.get(symbol);
		const state = this._dataBuffer.getSymbolState(symbol);
		if (!(model && state)) {
			return;
		}
		const score = featureDriftScore(
			state,
			model.normalization,
			model.createdAt
		);
		if (score !== undefined) {
			FEATURE_DRIFT_SCORE.set({ symbol }, score);
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
