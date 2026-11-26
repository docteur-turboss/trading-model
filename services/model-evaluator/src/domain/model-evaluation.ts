import { normalizeError } from "@trading-model/common/utils/errors";
import type { CandleData } from "@trading-model/contracts/market-data.types";
import {
	KEY_PART,
	type ModelManifest,
} from "@trading-model/model-runtime/model-manifest";
import { replayModel } from "@trading-model/model-runtime/replay";
import type { SegmentRatios } from "@trading-model/model-runtime/replay-metrics";
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
	const bars = candles.filter((candle) => candle.closeTimestamp <= window.to);
	if (
		bars[0]?.timestamp !== window.from ||
		bars[bars.length - 1]?.closeTimestamp !== window.to
	) {
		return { replay: "failed", reason: "missing-candles" };
	}
	try {
		const ratios = replayModel({
			genome,
			// A copy: float32 needs 4-byte alignment, a Buffer slice may not have it.
			weights: new Float32Array(new Uint8Array(weights).buffer),
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
