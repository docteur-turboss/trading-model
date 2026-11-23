import type { CandleData } from "@trading-model/contracts/market-data.types";
import type {
	Price,
	Ratio,
	Volume,
} from "@trading-model/primitives/primitives";
import { FeatureVector } from "../feature-vector";
import { SlidingWindowSize } from "../feature-vector-codec";
import { NormalizationStats } from "./normalization-stats";

/** One day in milliseconds: the length of a daily bar (ADR-0083). */
export const DAY_MS = 86_400_000;

/** A daily bar is fresh over a weekend plus a Monday holiday: Friday's close is still current on Tuesday; also the widest gap inside a daily series. */
export const DAILY_MAX_DATA_AGE_MS = 4 * DAY_MS;

/** `low`/`high` must bound `open` and `close`: features divide by `high - low`. */
export function isConsistentCandle(candle: CandleData): boolean {
	return (
		candle.low <= Math.min(candle.open, candle.close) &&
		Math.max(candle.open, candle.close) <= candle.high
	);
}

/**
 * The candles after the last gap: the series never links two candles further
 * apart than one bar (1 min), or than DAILY_MAX_DATA_AGE_MS for daily bars
 * (weekends and holidays stay inside), so no step carries a gap's return.
 */
export function contiguousCandles(candles: CandleData[]): CandleData[] {
	let start = 0;
	for (let idx = 1; idx < candles.length; idx++) {
		const { timestamp, closeTimestamp } = candles[idx - 1];
		const barMs = closeTimestamp - timestamp + 1;
		const maxGapMs = barMs >= DAY_MS ? DAILY_MAX_DATA_AGE_MS : barMs;
		if (candles[idx].timestamp - timestamp > maxGapMs) {
			start = idx;
		}
	}
	return start === 0 ? candles : candles.slice(start);
}

export interface CandleNormalizers {
	close: NormalizationStats;
	volume: NormalizationStats;
	open: NormalizationStats;
	high: NormalizationStats;
	low: NormalizationStats;
}

/**
 * What a candle's features read: the data known at its close, normalised with
 * statistics of that data only (ADR-0030).
 */
export interface FeatureState {
	candles: CandleData[];
	norm: { candle: CandleNormalizers };
}

/** One bar of a replay or a training window (ADR-0066). */
export interface CandleStep {
	/** Close of the bar: what the decision knows, and the wallet's mark. */
	price: Price;
	/** Open of the next bar, where the decision fills; absent on the last bar. */
	fillPrice?: Price;
	features: FeatureVector;
	timestamp: number;
}

function candleVolumeRatio(cur: CandleData, state: FeatureState): number {
	const volStd = state.norm.candle.volume.getStd();
	return volStd > 1e-10 ? cur.volume / volStd : 0;
}

function buildCandleFeatures(
	features: FeatureVector,
	state: FeatureState,
	idx: number
): void {
	const cur = state.candles[idx];
	const prev = state.candles[idx - 1];
	const norm = state.norm.candle;
	features.candle.close = norm.close.normalize(cur.close) as Price;
	features.candle.volume = norm.volume.normalize(cur.volume) as Volume;
	features.candle.returnRatio = (
		prev && prev.close > 0 ? (cur.close - prev.close) / prev.close : 0
	) as Ratio;
	features.candle.positionRatio = (
		cur.high - cur.low > 0 ? (cur.close - cur.open) / (cur.high - cur.low) : 0
	) as Ratio;
	features.candle.rangeRatio = (
		cur.close > 0 ? (cur.high - cur.low) / cur.close : 0
	) as Ratio;
	features.candle.open = norm.open.normalize(cur.open) as Price;
	features.candle.high = norm.high.normalize(cur.high) as Price;
	features.candle.low = norm.low.normalize(cur.low) as Price;
	features.candle.volumeRatio = candleVolumeRatio(cur, state) as Ratio;
}

/** Candles before a step that its features read (the sliding window). */
export const FEATURE_LOOKBACK = SlidingWindowSize;

function buildSlidingWindowFeatures(
	features: FeatureVector,
	state: FeatureState,
	idx: number
): void {
	const sw = features.slidingWindow();
	const lookbackStart = Math.max(0, idx - FEATURE_LOOKBACK);
	let swIdx = 0;
	for (let j = lookbackStart; j < idx && swIdx < sw.length; j++) {
		sw[swIdx++] = state.norm.candle.close.normalize(state.candles[j].close);
	}
	while (swIdx < sw.length) {
		sw[swIdx++] = 0;
	}
}

/** Features of candle `idx` from what was known at its close (ADR-0030). */
export function buildFeatures(ctx: {
	state: FeatureState;
	idx: number;
}): FeatureVector {
	const { state, idx } = ctx;
	const features = new FeatureVector();
	buildCandleFeatures(features, state, idx);
	buildSlidingWindowFeatures(features, state, idx);
	features.bias = 1.0;
	return features;
}

/** Fresh statistics of the five candle fields. */
export function createCandleNorms(): CandleNormalizers {
	return {
		close: new NormalizationStats(),
		volume: new NormalizationStats(),
		open: new NormalizationStats(),
		high: new NormalizationStats(),
		low: new NormalizationStats(),
	};
}

/** Adds one candle to the statistics of its fields. */
export function updateCandleNorms(
	norm: CandleNormalizers,
	candle: CandleData
): void {
	norm.close.update(candle.close);
	norm.volume.update(candle.volume);
	norm.open.update(candle.open);
	norm.high.update(candle.high);
	norm.low.update(candle.low);
}

/**
 * One step per candle after the first, each normalised with the statistics of
 * the candles known at its close, oldest first (ADR-0030): statistics of the
 * whole window would leak the future. The window is the only input, so the
 * trainer and a replay build the same steps (ADR-0078, ADR-0079).
 */
export function candleSteps(candles: CandleData[]): CandleStep[] {
	const norm = { candle: createCandleNorms() };
	const state = { candles, norm };
	const steps: CandleStep[] = [];
	candles.forEach((candle, idx) => {
		updateCandleNorms(norm.candle, candle);
		if (idx > 0) {
			steps.push({
				price: candle.close,
				fillPrice: candles[idx + 1]?.open,
				features: buildFeatures({ state, idx }),
				timestamp: candle.timestamp,
			});
		}
	});
	return steps;
}
