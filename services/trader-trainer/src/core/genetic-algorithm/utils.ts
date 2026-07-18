/** Clamp a number between `lo` and `hi` inclusive. */
export function clamp(value: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, value));
}

import type { GenomeId } from "@trading-model/common/domain/primitives";

/** Generate a short random alphanumeric identifier. */
export function generateId(): GenomeId {
	return Math.random().toString(36).slice(2, 10) as GenomeId;
}

import type { NormalizationStats } from "../normalization-stats";

export type RunningStats = NormalizationStats;
