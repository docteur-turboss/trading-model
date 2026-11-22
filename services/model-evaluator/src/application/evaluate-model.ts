import type { CandleData } from "@trading-model/contracts/market-data.types";
import { MODEL_REPLAY_SHARPE_GAP } from "../config/metrics";
import {
	type EvaluationRecord,
	type ModelManifest,
	type PublishedModel,
	type ReplayOutcome,
	replayOutcome,
	toRecord,
	verifyModel,
} from "../domain/model-evaluation";

interface Store {
	has(symbol: string, version: string): Promise<boolean>;
	create(record: EvaluationRecord): Promise<boolean>;
}

interface Trainer {
	manifest(symbol: string, version: string): Promise<ModelManifest>;
	weights(
		symbol: string,
		version: string
	): Promise<{ bytes: Uint8Array; sha256: string | undefined }>;
}

interface Scraper {
	/** Candles of `symbol` opened in [from, to), oldest first. */
	candles(symbol: string, from: number, to: number): Promise<CandleData[]>;
}

/** Reads the window of the manifest, never later than `to`, and replays the model on it. */
async function replay(
	scraper: Scraper,
	manifest: ModelManifest,
	weights: Uint8Array
): Promise<ReplayOutcome> {
	const window = manifest.replay;
	if (!window) {
		return { replay: "failed", reason: "no-window" };
	}
	// A read error propagates: the delivery fails and the bus retries it (ADR-0019).
	const candles = await scraper.candles(
		manifest.symbol,
		window.from,
		window.to
	);
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
	return async (event: PublishedModel): Promise<"recorded" | "duplicate"> => {
		if (await deps.store.has(event.symbol, event.version)) {
			return "duplicate";
		}
		const manifest = await deps.trainer.manifest(event.symbol, event.version);
		const weights = await deps.trainer.weights(event.symbol, event.version);
		verifyModel({
			event,
			manifest,
			weights: weights.bytes,
			headerSha256: weights.sha256,
		});
		const outcome = await replay(deps.scraper, manifest, weights.bytes);
		const published = manifest.admission?.criteria?.sharpe;
		if (outcome.replay === "done" && published !== undefined) {
			MODEL_REPLAY_SHARPE_GAP.set(
				{ symbol: manifest.symbol },
				outcome.metrics.sharpe - published
			);
		}
		return (await deps.store.create(toRecord(manifest, now(), outcome)))
			? "recorded"
			: "duplicate";
	};
}
