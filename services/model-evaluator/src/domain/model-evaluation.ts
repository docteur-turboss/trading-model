import { normalizeError } from "@trading-model/common/utils/errors";
import type { CandleData } from "@trading-model/contracts/market-data.types";
import {
	KEY_PART,
	type ModelManifest,
} from "@trading-model/model-runtime/model-manifest";
import { replayModel } from "@trading-model/model-runtime/replay";
import type { SegmentRatios } from "@trading-model/model-runtime/replay-metrics";
import {
	replaySectors,
	type SectorNetwork,
} from "@trading-model/model-runtime/sector-replay";
import { z } from "zod";

/** What the evaluator reads of `training.model.published` (ADR-0049 §1.1). */
export const PublishedModel = z.looseObject({
	symbol: KEY_PART,
	version: KEY_PART,
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
	admissible: z.boolean().optional(),
});
export type PublishedModel = z.infer<typeof PublishedModel>;

type ReplayWindow = NonNullable<ModelManifest["replay"]>;

/** Fees and execution cost paid over the replay, in quote currency. */
interface ReplayCosts {
	feesPaid: number;
	executionCostPaid: number;
}

/** Ratios of the greedy replay on the test segment, or why there are none (ADR-0079). */
export type ReplayOutcome =
	| {
			replay: "done";
			metrics: { policy: "greedy" } & SegmentRatios & ReplayCosts;
	  }
	| { replay: "failed"; reason: string };

/** One evaluation per `(symbol, version)`. */
export type EvaluationRecord = {
	symbol: string;
	version: string;
	evaluatedAt: string;
	weightsSha256: string;
	/** ADR-0069 verdict of the trainer, copied: the evaluator never promotes a model. */
	admissible: boolean;
} & ReplayOutcome;

/** Bars closed by `window.to`, or undefined when they do not cover the window. */
function windowBars(
	window: ReplayWindow,
	candles: readonly CandleData[]
): CandleData[] | undefined {
	const bars = candles.filter((candle) => candle.closeTimestamp <= window.to);
	return bars[0]?.timestamp === window.from &&
		bars[bars.length - 1]?.closeTimestamp === window.to
		? bars
		: undefined;
}

/** Float32 needs 4-byte alignment, a Buffer slice may not have it: a copy. */
const toFloats = (weights: Uint8Array) =>
	new Float32Array(new Uint8Array(weights).buffer);

/** A sector as the evaluator reads it: its manager and its analysts with their candles. */
export interface SectorInput {
	manager: { genome: ModelManifest["genome"]; weights: Uint8Array };
	pooling?: ModelManifest["pooling"];
	analysts: readonly {
		symbol: string;
		genome: ModelManifest["genome"];
		weights: Uint8Array;
		candles: readonly CandleData[];
	}[];
}

/**
 * Replays a composition (ADR-0076 §3, §7) on the test segment: every asset
 * must cover the window, else `missing-candles`. An `allocator` manifest is
 * played over its sectors, any other manifest is the one sector.
 */
export function compositionOutcome(
	manifest: ModelManifest,
	weights: Uint8Array,
	sectors: readonly SectorInput[]
): ReplayOutcome {
	const window = manifest.replay;
	if (!window) {
		return { replay: "failed", reason: "no-window" };
	}
	const loaded: Parameters<typeof replaySectors>[0]["sectors"][number][] = [];
	for (const sector of sectors) {
		const assets: (typeof loaded)[number]["assets"][number][] = [];
		for (const analyst of sector.analysts) {
			const bars = windowBars(window, analyst.candles);
			if (!bars) {
				return { replay: "failed", reason: "missing-candles" };
			}
			assets.push({
				symbol: analyst.symbol,
				analyst: {
					genome: analyst.genome,
					weights: toFloats(analyst.weights),
				} satisfies SectorNetwork,
				candles: bars,
			});
		}
		loaded.push({
			assets,
			manager: {
				genome: sector.manager.genome,
				weights: toFloats(sector.manager.weights),
			},
			pooling: sector.pooling ?? "mean+max",
		});
	}
	const limits = manifest.riskLimits;
	try {
		const ratios = replaySectors({
			sectors: loaded,
			allocator:
				manifest.role === "allocator"
					? {
							network: {
								genome: manifest.genome,
								weights: toFloats(weights),
							},
							limits: {
								maxExposureFraction: limits?.maxExposureFraction ?? 1,
								maxConcentration: limits?.maxConcentration ?? 1,
							},
						}
					: undefined,
			testFrom: window.testFrom,
			simulator: {
				...window.simulator,
				maxExposureFraction: limits?.maxExposureFraction,
			},
		});
		return { replay: "done", metrics: { policy: "greedy", ...ratios } };
	} catch (err) {
		return {
			replay: "failed",
			reason: `replay-error: ${normalizeError(err).message}`,
		};
	}
}

/**
 * Replays the model greedily on the candles read for its window (ADR-0079
 * §3-4): candles closing after `to` are never used, and a window the
 * candles do not cover from `from` to `to` is `missing-candles`.
 */
export function replayOutcome(
	window: ReplayWindow,
	genome: ModelManifest["genome"],
	weights: Uint8Array,
	candles: readonly CandleData[],
	maxExposureFraction?: number
): ReplayOutcome {
	const bars = windowBars(window, candles);
	if (!bars) {
		return { replay: "failed", reason: "missing-candles" };
	}
	try {
		const ratios = replayModel({
			genome,
			weights: toFloats(weights),
			testFrom: window.testFrom,
			simulator: { ...window.simulator, maxExposureFraction },
			candles: bars,
		});
		return { replay: "done", metrics: { policy: "greedy", ...ratios } };
	} catch (err) {
		return {
			replay: "failed",
			reason: `replay-error: ${normalizeError(err).message}`,
		};
	}
}

export function toRecord(
	manifest: ModelManifest,
	now: Date,
	outcome: ReplayOutcome
): EvaluationRecord {
	return {
		symbol: manifest.symbol,
		version: manifest.version,
		evaluatedAt: now.toISOString(),
		weightsSha256: manifest.weights.sha256,
		admissible: manifest.admission?.admissible ?? false,
		...outcome,
	};
}
