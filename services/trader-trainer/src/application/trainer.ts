import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { buyAndHoldSharpe } from "@trading-model/model-runtime/replay-metrics";
import { Fitness, NonNegativeInt } from "@trading-model/primitives/primitives";
import {
	BEST_FITNESS,
	FEATURE_DRIFT_SCORE,
	MODEL_BELOW_BUY_AND_HOLD_STREAK,
	MODEL_BUY_AND_HOLD_SHARPE,
	MODEL_MAX_DRAWDOWN,
	MODEL_RETURN,
	MODEL_SHARPE,
	reportInputGroups,
	TRAINING_DURATION_SECONDS,
	TRAINING_SESSIONS_TOTAL,
	TRAINING_STATUS,
} from "../config/metrics";
import { featureDriftScore } from "../domain/feature-drift";
import type { WindowSet } from "../domain/genetic-algorithm/ga-runner";
import type { GaTelemetry } from "../domain/genetic-algorithm/ga-telemetry";
import { inputGroupNames } from "../domain/genetic-algorithm/genome-network/input-mask";
import type { SimulatorCosts } from "../domain/genetic-algorithm/rl-backend";
import type { MarketDataBuffer } from "../domain/market-data-buffer";
import type { TradingSymbol } from "../domain/market-data-types";
import type { ModelArtifactStorePort } from "../domain/ports/model-artifact-store.port";
import type {
	ModelPublisherPort,
	StoredModelRef,
} from "../domain/ports/model-publisher.port";
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
import { ModelArtifactService } from "./model-artifact-service";
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
	/** Costs of a daily asset (ADR-0083); undefined: a crypto symbol on one-minute candles. */
	dailyCosts?: (symbol: TradingSymbol) => SimulatorCosts | undefined;
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

	private readonly _artifacts: ModelArtifactService;

	constructor(
		private readonly _dataBuffer: MarketDataBuffer,
		private readonly _deps: TrainerDeps
	) {
		this._artifacts = new ModelArtifactService(_dataBuffer, _deps);
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

	/** Serves the newest stored agent of each symbol until a training replaces it. */
	async rehydrate(symbols: readonly TradingSymbol[]): Promise<void> {
		for (const {
			symbol,
			snapshot,
			lastModel,
		} of await this._artifacts.rehydrate(symbols)) {
			if (!this._lastModels.has(symbol)) {
				this._lastModels.set(symbol, lastModel);
			}
			if (!this._symbolSnapshots.has(symbol)) {
				this._symbolSnapshots.set(symbol, snapshot);
				// /best-agent reads the last snapshot: serve the first one until a training.
				if (this._lastInfo instanceof NullLastTrainingInfo) {
					this._lastInfo = snapshot;
				}
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
			const summary = this._lastInfo.buildBestAgentSummary();
			const stored = await this._artifacts.store(result, windowSets, summary);
			if (stored && summary) {
				this._lastModels.set(symbol, stored.lastModel);
				this._reportModelPerformance(symbol, summary, windowSets);
				await this._publishModel(symbol, stored.ref);
			}
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
			{ ...this._deps.settings, costs: this._deps.dailyCosts?.(symbol) },
			this._deps.telemetry,
			signal
		);
		const outcome = {
			symbol,
			bestGenome: result.bestGenome,
			bestFitness: Fitness.of(result.bestFitness),
			bestFitnessMeta: result.bestFitnessMeta,
			generation: NonNegativeInt.of(result.generation),
		};
		const publishedMask = result.bestGenome.network.inputMask;
		if (publishedMask) {
			const groups = inputGroupNames(this._dataBuffer.signalKeys);
			reportInputGroups("published", groups, [publishedMask]);
			reportInputGroups("population", groups, result.inputMasks ?? []);
		}
		const snapshot = new LastTrainingInfo(outcome);
		this._lastInfo = snapshot;
		this._symbolSnapshots.set(symbol, snapshot);
		getLogger().info("Training complete", {
			context: { symbol, bestFitness: result.bestFitness },
		});
		return { success: true, ...outcome };
	}

	/** Out-of-sample metrics of a stored model next to buy and hold on its bars. */
	private _reportModelPerformance(
		symbol: TradingSymbol,
		summary: BestAgentSummary,
		windowSets: WindowSet[]
	): void {
		const labels = { symbol, segment: summary.evaluatedOn };
		const baseline = buyAndHoldSharpe(
			summary.evaluatedOn === "test"
				? [windowSets[windowSets.length - 1]?.test ?? []]
				: windowSets.map((ws) => ws.validation)
		);
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

	private async _publishModel(
		symbol: TradingSymbol,
		stored: StoredModelRef
	): Promise<void> {
		const publisher = this._deps.publisher;
		if (!publisher) {
			return;
		}
		const summary = this._lastInfo.buildBestAgentSummary();
		if (!summary) {
			return;
		}
		try {
			await publisher.publish(symbol, summary, stored);
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
}
