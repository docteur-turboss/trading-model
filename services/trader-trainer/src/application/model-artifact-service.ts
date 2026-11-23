import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { isEventDriven } from "@trading-model/model-runtime/agent/decision-events";
import { contiguousCandles } from "@trading-model/model-runtime/features/feature-builder";
import {
	MODEL_ADMISSION_TOTAL,
	MODEL_ARTIFACTS_TOTAL,
} from "../config/metrics";
import {
	eventInputLayout,
	networkInputLayout,
} from "../domain/agent/agent-state";
import type { WindowSet } from "../domain/genetic-algorithm/ga-runner";
import { SIMULATOR_PARAMS } from "../domain/genetic-algorithm/rl-backend";
import { summaryFromManifest } from "../domain/genome-summary-builder";
import type { MarketDataBuffer } from "../domain/market-data-buffer";
import { DAY_MS, type TradingSymbol } from "../domain/market-data-types";
import { assessAdmission } from "../domain/model-admission";
import type {
	ModelComponent,
	ModelReplayWindow,
} from "../domain/model-artifact";
import type { ModelArtifactStorePort } from "../domain/ports/model-artifact-store.port";
import type { StoredModelRef } from "../domain/ports/model-publisher.port";
import {
	ArtifactTrainingInfo,
	type BestAgentSummary,
} from "../domain/training-state";
import type { TrainingSuccess } from "../domain/training-types";
import type { TrainerDeps } from "./trainer";

/** Normalization of a stored model: drift baseline. */
export interface LastModel {
	createdAt: number;
	normalization: Record<string, unknown>;
}

/** What the trainer applies to its own state after a rehydration. */
export interface RehydratedModel {
	symbol: TradingSymbol;
	snapshot: ArtifactTrainingInfo;
	lastModel: LastModel;
	ref: StoredModelRef;
}

/**
 * Rank of the next admission verdict of a symbol (ADR-0069): above the
 * newest recorded rank and the versions still held, so retention pruning
 * never lowers it. A read failure only drops the optional field.
 */
export async function nextAttempt(
	models: ModelArtifactStorePort,
	symbol: string
): Promise<number | undefined> {
	try {
		const [latest, versions] = await Promise.all([
			models.latest(symbol),
			models.list(symbol),
		]);
		return Math.max(latest?.admission?.attempt ?? 0, versions.length) + 1;
	} catch (err) {
		getLogger().warn("Admission attempt rank unavailable", {
			context: { symbol, err: normalizeError(err).message },
		});
	}
}

/** Reads and writes the versioned model artifacts (ADR-0022); owns no trainer state. */
export class ModelArtifactService {
	constructor(
		private readonly _dataBuffer: MarketDataBuffer,
		private readonly _deps: Pick<
			TrainerDeps,
			"models" | "instanceId" | "dailyCosts"
		>
	) {}

	/**
	 * Newest stored agent of each symbol. An unreadable manifest is logged and
	 * skipped (startup goes on).
	 */
	async rehydrate(
		symbols: readonly TradingSymbol[]
	): Promise<RehydratedModel[]> {
		const models = this._deps.models;
		const found: RehydratedModel[] = [];
		for (const symbol of symbols) {
			try {
				const manifest = await models.latest(String(symbol));
				if (!manifest) {
					continue;
				}
				if (
					JSON.stringify(manifest.features) !==
						JSON.stringify(networkInputLayout(this._dataBuffer.signalKeys)) &&
					JSON.stringify(manifest.features) !==
						JSON.stringify(eventInputLayout(this._dataBuffer.signalKeys))
				) {
					// Published before the 18-input layout (ADR-0078): retrained, not served.
					getLogger().warn("Stored model has another feature layout, skipped", {
						context: { symbol, version: manifest.version },
					});
					continue;
				}
				found.push({
					symbol,
					snapshot: new ArtifactTrainingInfo(
						String(symbol),
						summaryFromManifest(manifest)
					),
					lastModel: {
						createdAt: Date.parse(manifest.createdAt),
						normalization: manifest.normalization,
					},
					ref: {
						version: manifest.version,
						sha256: manifest.weights.sha256,
						admissible: manifest.admission?.admissible ?? false,
					},
				});
				getLogger().info("Best agent rehydrated", {
					context: { symbol, version: manifest.version },
				});
			} catch (err) {
				getLogger().error("Cannot rehydrate the best agent from its manifest", {
					context: { symbol, err: normalizeError(err).message },
				});
			}
		}
		return found;
	}

	/**
	 * Writes the best agent as a versioned artifact. A failed write is logged
	 * and counted: the training itself succeeded, its result stays usable.
	 * Returns `undefined` when nothing was stored (nothing may then be published).
	 */
	async store(
		result: TrainingSuccess,
		windowSets: WindowSet[],
		summary: BestAgentSummary | null,
		components?: ModelComponent[]
	): Promise<{ ref: StoredModelRef; lastModel: LastModel } | undefined> {
		const models = this._deps.models;
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
		const last = windowSets[windowSets.length - 1];
		try {
			const attempt = await nextAttempt(models, result.symbol);
			const admission = assessAdmission(
				result.bestFitnessMeta,
				last?.test ?? [],
				attempt
			);
			const stored = await models.save({
				symbol: result.symbol,
				instanceId: this._deps.instanceId,
				bestGenome: result.bestGenome,
				weights: new Float32Array(weights),
				features: isEventDriven(result.bestGenome.rl.horizon)
					? eventInputLayout(this._dataBuffer.signalKeys)
					: networkInputLayout(this._dataBuffer.signalKeys),
				normalization,
				summary,
				admission,
				window: this._replayWindow(result.symbol, last),
				components,
			});
			MODEL_ARTIFACTS_TOTAL.inc({ result: "stored" });
			const admissible = admission?.admissible ?? false;
			MODEL_ADMISSION_TOTAL.inc({
				result: admissible ? "admissible" : "rejected",
			});
			getLogger().info("Model stored", {
				context: { symbol: result.symbol, version: stored.version, admissible },
			});
			return {
				ref: { version: stored.version, sha256: stored.sha256, admissible },
				lastModel: { createdAt: Date.parse(stored.createdAt), normalization },
			};
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

	/** Candle window of the session, for the manifest `replay` block (ADR-0079). */
	private _replayWindow(
		symbol: TradingSymbol,
		last: WindowSet | undefined
	): ModelReplayWindow | undefined {
		// The steps start after the last gap (window-splitter): so does the window.
		const candles = contiguousCandles(
			this._dataBuffer.getSymbolState(symbol)?.candles ?? []
		);
		const testFrom = last?.test?.[0]?.timestamp;
		if (candles.length === 0 || testFrom === undefined) {
			return;
		}
		const costs = this._deps.dailyCosts?.(symbol);
		return {
			from: candles[0].timestamp,
			testFrom,
			to: candles[candles.length - 1].closeTimestamp,
			...(costs && {
				intervalMs: DAY_MS,
				simulator: { ...SIMULATOR_PARAMS, ...costs },
			}),
		};
	}
}
