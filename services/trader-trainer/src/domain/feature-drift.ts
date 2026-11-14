import { DataType } from "./data-handlers/data-types";
import type { BaseSymbolState } from "./market-data-types";
import { NormalizationManager } from "./normalization-manager";
import { NormalizationStats } from "./normalization-stats";

interface StoredStats {
	count: number;
	mean: number;
	m2: number;
}

/** Normalized fields read from the live buffer, by the data type that feeds them. */
const LIVE_SOURCES: [DataType, keyof BaseSymbolState][] = [
	[DataType.Candle, "candles"],
	[DataType.Trade, "trades"],
	[DataType.OrderBook, "orderBooks"],
	[DataType.BookTicker, "bookTickers"],
	[DataType.Ticker, "tickers24h"],
];

function isStoredStats(value: unknown): value is StoredStats {
	const stats = value as StoredStats | null;
	return (
		typeof stats?.count === "number" &&
		typeof stats.mean === "number" &&
		typeof stats.m2 === "number"
	);
}

/**
 * Feature drift of the live stream against the normalization statistics stored
 * with a model (ADR-0022): the largest |live mean - model mean| / model std
 * over the normalized fields, the live mean taken over the data received at or
 * after `since` (data the model never saw). Undefined when no field can be
 * compared (no live data since, or no model std).
 */
export function featureDriftScore(
	state: BaseSymbolState,
	modelNormalization: Record<string, unknown>,
	since: number
): number | undefined {
	const manager = new NormalizationManager();
	const live = { norm: manager.createNormStats() };
	for (const [dataType, key] of LIVE_SOURCES) {
		for (const item of state[key]) {
			if (item.timestamp >= since) {
				manager.updateNorms(dataType, live, item);
			}
		}
	}
	let score: number | undefined;
	for (const [group, fields] of Object.entries(modelNormalization ?? {})) {
		for (const [field, stored] of Object.entries(
			(fields ?? {}) as Record<string, unknown>
		)) {
			const liveStats = (
				live.norm as unknown as Record<
					string,
					Record<string, NormalizationStats> | undefined
				>
			)[group]?.[field];
			if (!(isStoredStats(stored) && liveStats?.toJSON().count)) {
				continue;
			}
			const modelStd = NormalizationStats.fromJSON(stored).getStd();
			if (modelStd < 1e-10) {
				continue;
			}
			const zScore = Math.abs(liveStats.getMean() - stored.mean) / modelStd;
			score = Math.max(score ?? 0, zScore);
		}
	}
	return score;
}
