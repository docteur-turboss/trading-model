import { createHash } from "node:crypto";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { CandleData } from "@trading-model/contracts/market-data.types";
import { ModelManifestSchema } from "@trading-model/model-runtime/model-manifest";
import { replayModel } from "@trading-model/model-runtime/replay";
import type { SegmentRatios } from "@trading-model/model-runtime/replay-metrics";
import { z } from "zod";

/** Safe as a path segment: the key names the record file. */
const KEY_PART = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);

/** What the evaluator reads of `training.model.published` (ADR-0049 §1.1). */
export const PublishedModel = z.looseObject({
	symbol: KEY_PART,
	version: KEY_PART,
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
	admissible: z.boolean().optional(),
});
export type PublishedModel = z.infer<typeof PublishedModel>;

/** The part of the trainer manifest the evaluator relies on (ADR-0022). */
export const ModelManifest = ModelManifestSchema.pick({
	symbol: true,
	version: true,
	weights: true,
	genome: true,
	admission: true,
	replay: true,
	riskLimits: true,
});
export type ModelManifest = z.infer<typeof ModelManifest>;
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
 * Checks the downloaded weights against the event, the manifest and the
 * `x-model-sha256` header; throws on any mismatch (ADR-0049 §1.2).
 */
export function verifyModel(input: {
	event: PublishedModel;
	manifest: ModelManifest;
	weights: Uint8Array;
	headerSha256: string | undefined;
}): void {
	const { event, manifest, weights, headerSha256 } = input;
	const actual = createHash("sha256").update(weights).digest("hex");
	const expected = manifest.weights.sha256;
	if (manifest.symbol !== event.symbol || manifest.version !== event.version) {
		throw new Error(
			`Manifest ${manifest.symbol}/${manifest.version} is not the published ${event.symbol}/${event.version}`
		);
	}
	if (
		actual !== expected ||
		event.sha256 !== expected ||
		headerSha256 !== expected
	) {
		throw new Error(
			`Weights of ${event.symbol}/${event.version} refused: sha256 ${actual} differs from the manifest ${expected}, the event ${event.sha256} or the header ${headerSha256}`
		);
	}
	if (weights.byteLength !== manifest.weights.length * 4) {
		throw new Error(
			`Weights of ${event.symbol}/${event.version} refused: ${weights.byteLength} bytes for ${manifest.weights.length} float32`
		);
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
	maxExposureFraction = 1
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
