import type { CandleData } from "@trading-model/contracts/market-data.types";
import {
	isSupportedInterval,
	type ModelManifest,
	verifyModel,
} from "@trading-model/model-runtime/model-manifest";
import { MODEL_REPLAY_SHARPE_GAP } from "../config/metrics";
import {
	type EvaluationRecord,
	type PublishedModel,
	type ReplayOutcome,
	replayOutcome,
	toRecord,
} from "../domain/model-evaluation";

interface Store {
	has(symbol: string, version: string): Promise<boolean>;
	create(record: EvaluationRecord): Promise<boolean>;
}

interface Trainer {
	manifest(
		symbol: string,
		version: string,
		signal?: AbortSignal
	): Promise<ModelManifest>;
	weights(
		symbol: string,
		version: string,
		signal?: AbortSignal
	): Promise<{ bytes: Uint8Array; sha256: string | undefined }>;
}

interface Scraper {
	/** Bars of `symbol` (one minute or one day long, `intervalMs`) opened in [from, to), oldest first. */
	candles(
		symbol: string,
		from: number,
		to: number,
		intervalMs: number,
		signal?: AbortSignal
	): Promise<CandleData[]>;
}

/** Whole evaluation, under the bus handler deadline (85 s) so it stops before its redelivery starts. */
const EVALUATION_BUDGET_MS = 75_000;

/** Reads the window of the manifest, never later than `to`, and replays the model on it. */
async function replay(
	scraper: Scraper,
	manifest: ModelManifest,
	weights: Uint8Array,
	signal: AbortSignal
): Promise<ReplayOutcome> {
	const window = manifest.replay;
	if (!window) {
		return { replay: "failed", reason: "no-window" };
	}
	const intervalMs = window.intervalMs;
	if (!isSupportedInterval(intervalMs)) {
		return {
			replay: "failed",
			reason: `unsupported-interval: ${intervalMs} ms`,
		};
	}
	// A read error propagates: the delivery fails and the bus retries it (ADR-0019).
	const candles = await scraper.candles(
		manifest.symbol,
		window.from,
		window.to,
		intervalMs,
		signal
	);
	// A late answer must not be replayed once the delivery was abandoned.
	signal.throwIfAborted();
	return replayOutcome(
		window,
		manifest.genome,
		weights,
		candles,
		manifest.riskLimits?.maxExposureFraction
	);
}

/**
 * Handles one `training.model.published` delivery (at-least-once): idempotent
 * on `(symbol, version)`, nothing is recorded for weights that fail the
 * checks (the delivery fails and goes through the bus retries, ADR-0019).
 */
export function createEvaluateModel(deps: {
	store: Store;
	trainer: Trainer;
	scraper: Scraper;
	now?: () => Date;
}) {
	const now = deps.now ?? (() => new Date());
	return async (
		event: PublishedModel,
		busSignal?: AbortSignal
	): Promise<"recorded" | "duplicate"> => {
		const signal = AbortSignal.any([
			AbortSignal.timeout(EVALUATION_BUDGET_MS),
			...(busSignal ? [busSignal] : []),
		]);
		if (await deps.store.has(event.symbol, event.version)) {
			return "duplicate";
		}
		const manifest = await deps.trainer.manifest(
			event.symbol,
			event.version,
			signal
		);
		const weights = await deps.trainer.weights(
			event.symbol,
			event.version,
			signal
		);
		verifyModel({
			model: event,
			manifest,
			weights: weights.bytes,
			headerSha256: weights.sha256,
		});
		const outcome = await replay(deps.scraper, manifest, weights.bytes, signal);
		const published = manifest.admission?.criteria?.sharpe;
		if (outcome.replay === "done" && published !== undefined) {
			MODEL_REPLAY_SHARPE_GAP.set(
				{ symbol: manifest.symbol },
				outcome.metrics.sharpe - published
			);
		}
		signal.throwIfAborted();
		return (await deps.store.create(toRecord(manifest, now(), outcome)))
			? "recorded"
			: "duplicate";
	};
}
