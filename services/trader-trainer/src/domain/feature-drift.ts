import { NormalizationStats } from "@trading-model/model-runtime/features/normalization-stats";
import { candleHandler } from "./data-handlers/candle-handler";
import type { BaseSymbolState } from "./market-data-types";

interface StoredStats {
	count: number;
	mean: number;
	m2: number;
}

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
	const live = { norm: candleHandler.createNorms() };
	for (const item of state.candles) {
		if (item.timestamp >= since) {
			candleHandler.updateNorms(live, item);
		}
	}
	let score: number | undefined;
	for (const [group, fields] of Object.entries(modelNormalization ?? {})) {
		for (const [field, stored] of Object.entries(
			(fields ?? {}) as Record<string, unknown>
		)) {
			// as unknown as: `norm` is a class instance; its per-group stats are read by dynamic key
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
