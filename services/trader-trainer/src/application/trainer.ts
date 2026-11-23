import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { inputGroupNames } from "@trading-model/model-runtime/agent/input-mask";
import { buyAndHoldSharpe } from "@trading-model/model-runtime/replay-metrics";
import { Fitness, NonNegativeInt } from "@trading-model/primitives/primitives";
import {
	BEST_FITNESS,
	FEATURE_DRIFT_SCORE,
	MODEL_BELOW_BUY_AND_HOLD_STREAK,
	MODEL_BUY_AND_HOLD_SHARPE,
	MODEL_MAX_DRAWDOWN,
	MODEL_PUBLISH_FAILURES_TOTAL,
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
import type { SimulatorCosts } from "../domain/genetic-algorithm/rl-backend";
import { trunkSha256 } from "../domain/genetic-algorithm/shared-trunk";
import type { MarketDataBuffer } from "../domain/market-data-buffer";
import type { TradingSymbol } from "../domain/market-data-types";
import type { ModelComponent } from "../domain/model-artifact";
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
import type { TrainingRunner, TrainingSessionResult } from "./training-session";

export type { BestAgentSummary };

export interface TrainerDeps {
	settings: TrainingSettings;
	publisher: ModelPublisherPort;
	telemetry: GaTelemetry;
	/** Keeps the best agent of each training as a versioned artifact (ADR-0022). */
	models: ModelArtifactStorePort;
	/** Instance written in the artifacts it produces. */
	instanceId: string;
	/** Where the session runs. */
	runner: TrainingRunner;
	/** Costs of a daily asset (ADR-0083); undefined: a crypto symbol on one-minute candles. */
	dailyCosts: (symbol: TradingSymbol) => SimulatorCosts | undefined;
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
	/** Stored models whose publication failed or is unknown (rehydrated): the leader retries them (issue #1739). */
	private readonly _unpublished = new Map<
		TradingSymbol,
		{ summary: BestAgentSummary; ref: StoredModelRef }
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
			ref,
		} of await this._artifacts.rehydrate(symbols)) {
			if (!this._lastModels.has(symbol)) {
				this._lastModels.set(symbol, lastModel);
			}
			const summary = snapshot.buildBestAgentSummary();
			// Reached the bus before the restart? Unknown: the leader publishes it once, model-evaluator deduplicates.
			if (summary && !this._unpublished.has(symbol)) {
				this._unpublished.set(symbol, { summary, ref });
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
		const validation = this._validate(symbol);
		if (!validation.ok) {
			return validation.error;
		}
		this._reportFeatureDrift(symbol);
		return await this._start(symbol, async (signal) => {
			const { windowSets } = validation;
			const session = await this._runSession(symbol, windowSets, signal);
			return this._complete(symbol, session, windowSets);
		});
	}

	/**
	 * FEATURE_SHARED_TRUNK (ADR-0076 step 1): one session for `symbols`, which
	 * share their hidden layers and keep a head each; every symbol is stored and
	 * published as its own asset model naming the shared trunk in `components`.
	 * Returns the result of the first symbol.
	 */
	async trainGroup(symbols: readonly TradingSymbol[]): Promise<TrainingResult> {
		const checks = symbols.map((symbol) => this._validate(symbol));
		const failed = checks.find((check) => !check.ok);
		if (failed && !failed.ok) {
			return failed.error;
		}
		// One simulator cost model serves the whole session (ADR-0083): a daily
		// symbol next to a crypto one would be scored on the wrong costs.
		const daily = symbols.map(
			(symbol) => this._deps.dailyCosts(symbol) !== undefined
		);
		if (daily.some((isDaily) => isDaily !== daily[0])) {
			return this._handleTrainingError(
				symbols[0],
				new Error(
					`Shared trunk group mixes daily and intraday symbols: ${symbols.join(", ")}`
				)
			);
		}
		const sets = checks.map((check) => (check.ok ? check.windowSets : []));
		const windowSets = sets.flatMap((group, index) =>
			group.map((ws) => ({ ...ws, symbol: String(symbols[index]) }))
		);
		for (const symbol of symbols) {
			this._reportFeatureDrift(symbol);
		}
		return await this._start(symbols[0], async (signal) => {
			const session = await this._runSession(symbols[0], windowSets, signal);
			const trunk = trunkSha256(
				session.bestGenome.trainedWeights as Float32Array,
				session.bestGenome
			);
			const components: ModelComponent[] = [
				{
					role: "trunk",
					id: `trunk:${trunk.slice(0, 12)}`,
					version: trunk.slice(0, 12),
					sha256: trunk,
				},
			];
			const successes: TrainingSuccess[] = [];
			// Store and publish errors are caught and logged per symbol by
			// _complete (ADR-0017): one symbol failing leaves the others published.
			for (const [i, symbol] of symbols.entries()) {
				const own = session.symbols?.[String(symbol)];
				successes.push(
					await this._complete(
						symbol,
						{
							...session,
							bestGenome: {
								...session.bestGenome,
								trainedWeights: own?.weights,
							},
							bestFitnessMeta: own?.bestFitnessMeta,
						},
						sets[i],
						components
					)
				);
			}
			return successes[0];
		});
	}

	private _validate(symbol: TradingSymbol) {
		return validateTrainingPrerequisites(
			this._dataBuffer,
			() => this._status === TrainerStatus.Training,
			symbol,
			this._deps.settings
		);
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

	private async _start(
		symbol: TradingSymbol,
		work: (signal: AbortSignal) => Promise<TrainingSuccess>
	): Promise<TrainingResult> {
		const abort = new AbortController();
		const done = this._guarded(symbol, () => work(abort.signal));
		this._session = { abort, done };
		return await done;
	}

	private async _guarded(
		symbol: TradingSymbol,
		work: () => Promise<TrainingSuccess>
	): Promise<TrainingResult> {
		this._status = TrainerStatus.Training;
		TRAINING_STATUS.set(1);
		const start = performance.now();

		try {
			const result = await work();
			TRAINING_SESSIONS_TOTAL.inc({ result: "success" });
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
	): Promise<TrainingSessionResult> {
		const run: TrainingRunner = this._deps.runner;
		const result = await run(
			windowSets,
			{ ...this._deps.settings, costs: this._deps.dailyCosts(symbol) },
			this._deps.telemetry,
			signal
		);
		const publishedMask = result.bestGenome.network.inputMask;
		if (publishedMask) {
			const groups = inputGroupNames(this._dataBuffer.signalKeys);
			reportInputGroups("published", groups, [publishedMask]);
			reportInputGroups("population", groups, result.inputMasks ?? []);
		}
		return result;
	}

	/** Records, stores and publishes the best agent of one symbol. */
	private async _complete(
		symbol: TradingSymbol,
		result: TrainingSessionResult,
		windowSets: WindowSet[],
		components?: ModelComponent[]
	): Promise<TrainingSuccess> {
		const outcome = {
			symbol,
			bestGenome: result.bestGenome,
			bestFitness: Fitness.of(result.bestFitness),
			bestFitnessMeta: result.bestFitnessMeta,
			generation: NonNegativeInt.of(result.generation),
		};
		const snapshot = new LastTrainingInfo(outcome);
		this._lastInfo = snapshot;
		this._symbolSnapshots.set(symbol, snapshot);
		getLogger().info("Training complete", {
			context: { symbol, bestFitness: result.bestFitness },
		});
		BEST_FITNESS.set({ symbol }, result.bestFitness);
		const success = { success: true as const, ...outcome };
		const summary = snapshot.buildBestAgentSummary();
		const stored = await this._artifacts.store(
			success,
			windowSets,
			summary,
			components
		);
		if (stored && summary) {
			this._lastModels.set(symbol, stored.lastModel);
			this._reportModelPerformance(symbol, summary, windowSets);
			// The newest model supersedes any older pending one.
			this._unpublished.set(symbol, { summary, ref: stored.ref });
			await this._publishModel(symbol, summary, stored.ref);
		}
		return success;
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

	/** Leader only: publishes again each model whose publication has not succeeded (same version and hash). */
	async republishPending(): Promise<void> {
		for (const [symbol, { summary, ref }] of [...this._unpublished]) {
			await this._publishModel(symbol, summary, ref);
		}
	}

	private async _publishModel(
		symbol: TradingSymbol,
		summary: BestAgentSummary,
		stored: StoredModelRef
	): Promise<void> {
		const publisher = this._deps.publisher;
		try {
			await publisher.publish(symbol, summary, stored);
			// A slower call for an older version must not touch a newer entry.
			if (this._unpublished.get(symbol)?.ref.version === stored.version) {
				this._unpublished.delete(symbol);
			}
			getLogger().info("Model published", {
				context: { symbol, agentId: summary.id },
			});
		} catch (err) {
			MODEL_PUBLISH_FAILURES_TOTAL.inc({ symbol });
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
